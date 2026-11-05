import {initializeApp} from 'firebase/app';
import {
  browserLocalPersistence, browserSessionPersistence, getAuth, GoogleAuthProvider,
  onAuthStateChanged, setPersistence, signInWithPopup, signOut
} from 'firebase/auth';
import {
  collection, deleteField, doc, FieldPath, initializeFirestore, onSnapshot,
  persistentLocalCache, persistentMultipleTabManager, writeBatch
} from 'firebase/firestore';

const trustKey = 'waystep.sync.trusted';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function pack(trip) {
  const {id, steps, ...details} = trip;
  return {
    details,
    order: steps.map(step => step.id),
    steps: Object.fromEntries(steps.map(({id, ...fields}) => [id, fields]))
  };
}

function unpack(snapshot) {
  const {details, order, steps} = snapshot.data();
  const ordered = [...new Set([...order, ...Object.keys(steps)])];
  return {...details, id: snapshot.id, steps: ordered.filter(id => Object.hasOwn(steps, id) && typeof steps[id]?.title === 'string')
    .map(id => ({...steps[id], id}))};
}

function patch(batch, ref, before, after) {
  const fields = [];
  const diff = (prefix, old, next) => {
    for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (!same(old[key], next[key])) fields.push(new FieldPath(...prefix, key), next[key] ?? deleteField());
    }
  };
  diff(['details'], before.details, after.details);
  if (!same(before.order, after.order)) fields.push(new FieldPath('order'), after.order);
  for (const id of new Set([...Object.keys(before.steps), ...Object.keys(after.steps)])) {
    const old = before.steps[id];
    const next = after.steps[id];
    if (old && next) diff(['steps', id], old, next);
    else fields.push(new FieldPath('steps', id), next ?? deleteField());
  }
  if (fields.length) batch.update(ref, ...fields);
}

export function connect(config, ui) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  let db, user, library, unsubscribe, ready = false, pending = false, writes = 0, cached = false;
  let failed = false;

  const sync = {
    active: false,
    get uid() { return user?.uid; },
    get label() {
      if (!user) return ready ? 'Sign in & sync' : 'Checking account…';
      if (failed) return 'Sync needs attention';
      if (!ready) return 'Loading synced trips…';
      if (!navigator.onLine || cached) return 'Offline · changes sync online';
      return pending || writes ? 'Syncing changes…' : 'Synced';
    },
    get email() { return user?.email; },
    get ready() { return ready; },
    get canCopy() { return ready && !cached && !failed && navigator.onLine; },
    get trusted() { return localStorage.getItem(trustKey) === 'yes'; },
    async login(trusted) {
      await setPersistence(auth, trusted ? browserLocalPersistence : browserSessionPersistence);
      localStorage.setItem(trustKey, trusted ? 'yes' : 'no');
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    async logout() {
      if (pending || writes) throw Error('Wait for pending changes to sync before signing out.');
      await signOut(auth);
      location.reload();
    },
    save(before, next) {
      if (!ready || failed || !user) {
        ui.error('Your synced library is unavailable. Try reconnecting first.');
        return false;
      }
      try {
        if (next.length > 500) throw Error('Keep up to 500 trips in your synced library.');
        const old = new Map(before.map(trip => [trip.id, trip]));
        const batch = writeBatch(db);
        let changes = 0;
        for (const [index, trip] of next.entries()) {
          const previous = old.get(trip.id);
          old.delete(trip.id);
          if (same(trip, previous)) continue;
          const packed = pack(trip);
          if (new TextEncoder().encode(JSON.stringify(packed)).length > 800000 || trip.steps.length > 1000) {
            throw Error('This trip is too large to sync. Split it into smaller trips.');
          }
          const ref = doc(library, trip.id);
          if (previous) patch(batch, ref, pack(previous), packed);
          else batch.set(ref, {...packed, created: Date.now() - index});
          changes++;
        }
        for (const id of old.keys()) batch.delete(doc(library, id));
        if (changes + old.size > 500) throw Error('Please save fewer than 500 trip changes at a time.');
        if (!changes && !old.size) return true;
        const owner = user.uid;
        writes++;
        batch.commit().catch(() => {
          if (user?.uid === owner) ui.error('A change could not be synced. Your library will refresh with the last saved data.');
        }).finally(() => {
          if (user?.uid !== owner) return;
          writes--;
          ui.refresh();
        });
        ui.optimistic(next);
        return true;
      } catch (error) {
        ui.error(error.message);
        return false;
      }
    }
  };

  onAuthStateChanged(auth, account => {
    unsubscribe?.();
    user = account;
    const wasActive = sync.active;
    ready = !account;
    sync.active = Boolean(account);
    pending = cached = failed = false;
    writes = 0;

    if (account || wasActive) ui.switchLibrary(Boolean(account));
    else ui.refresh();
    if (!account) return;
    db ??= initializeFirestore(app, sync.trusted
      ? {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})}
      : {});
    library = collection(db, 'users', account.uid, 'trips');
    unsubscribe = onSnapshot(library, {includeMetadataChanges: true}, snapshot => {
      if (user?.uid !== account.uid) return;
      if (!ready && snapshot.metadata.fromCache && !sync.trusted) return;
      try {
        const documents = [...snapshot.docs].sort((a, b) => b.get('created') - a.get('created') || a.id.localeCompare(b.id));
        const trips = ui.validate(documents.map(unpack));
        pending = snapshot.metadata.hasPendingWrites;
        cached = snapshot.metadata.fromCache;
        ready = true;
        ui.receive(trips);
      } catch {
        failed = true;
        ui.error('The synced library contains a trip that Waystep could not read.');
        ui.refresh();
      }
    }, () => {
      if (user?.uid !== account.uid) return;
      failed = true;
      ui.error('Could not load synced trips. Check Firestore setup or sign out to use local trips.');
      ui.refresh();
    });
  });
  return sync;
}
