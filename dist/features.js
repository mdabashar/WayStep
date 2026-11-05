/* Account controls and the Waystep draft handoff. */
const config = window.WAYSTEP_CONFIG || {};
let accountStarting = Boolean(config.firebase?.apiKey);
let pendingDraft;
let guestTrips = trips;

function replaceLibrary(next) {
  const tripRemoved = active && !next.some(t => t.id === active);
  trips = next;
  if (tripRemoved) {
    active = null;
    editor.close();
  }
  render();
}

actions['cloud-account'] = () => {
  if (!cloud.ready && !cloud.uid) {
    toast('Checking your saved account. Try again in a moment.');
    return;
  }
  if (!cloud.uid) {
    showDialog('Sign in & sync', `<form><p>Use the same Google account on your other devices to open your trips and checked steps.</p>
      <p>Your existing guest trips stay in this browser. You can choose which to copy after signing in.</p>
      <label><input type="checkbox" name="trusted" ${cloud.trusted ? 'checked' : ''}> Remember me and keep synced trips offline on this personal device</label>
      <div class="form-footer"><button class="btn primary" type="submit">Continue with Google</button></div></form>`, async form => {
      const button = editor.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        await cloud.login(form.has('trusted'));
      } catch (error) {
        const message = error.code === 'auth/popup-blocked'
          ? 'Allow the Google sign-in pop-up in your browser and try again.'
          : error.code === 'auth/popup-closed-by-user'
            ? 'The sign-in window was closed. You can try again.'
            : 'Google sign-in failed. Check your connection and try again.';
        toast(message);
      } finally {
        button.disabled = false;
      }
    });
    return;
  }
  const existing = new Set(trips.map(t => t.id));
  const candidates = guestTrips.filter(t => !t.example && !existing.has(t.id));
  showDialog('Your synced library', `<form><p>${esc(cloud.email || 'Google account')} · ${esc(cloud.label)}</p>
    ${cloud.canCopy && candidates.length ? `<p>Choose guest trips from this browser to copy into your synced library.</p>
      <div class="fields">${candidates.map(t => `<label class="field full"><span><input type="checkbox" name="trip" value="${esc(t.id)}"> ${esc(t.title)}</span></label>`).join('')}</div>` : ''}
    <div class="form-footer"><button class="btn" type="button" data-action="cloud-logout">Sign out</button>
    ${cloud.canCopy && candidates.length ? '<button class="btn primary" type="submit">Copy selected trips</button>' : ''}</div></form>`, form => {
    if (!cloud.canCopy) return toast('Reconnect to copy guest trips to your synced library.');
    const selected = new Set(form.getAll('trip'));
    const currentIds = new Set(trips.map(t => t.id));
    const copy = candidates.filter(t => selected.has(t.id) && !currentIds.has(t.id));
    if (!copy.length) return toast('Choose at least one guest trip.');
    if (mutate(ts => ts.unshift(...structuredClone(copy)))) editor.close();
  });
};

actions['cloud-logout'] = async () => {
  try {
    await cloud.logout();
  } catch (error) {
    toast(error.message);
  }
};

actions['mcp-info'] = () => {
  showDialog('Connect your AI to Waystep', `<div class="help-content">
    ${config.mcpUrl ? `
      <p>Copy this URL into an AI app that supports custom remote MCP servers. Once connected, ask it to <strong>send your trip draft to Waystep</strong>.</p>
      <label class="field">MCP server URL<input id="mcp-server-url" value="${esc(config.mcpUrl)}" readonly></label>
      <button class="btn primary" data-action="mcp-copy-url">Copy server URL</button>
      <p>Open the link your AI returns to review and save the trip. Keep the link private if the itinerary includes personal details.</p>
    ` : '<p>The MCP server URL has not been configured. You can still use <strong>Plan with AI</strong> to import an itinerary manually.</p>'}
    ${pendingDraft ? '<button class="btn primary" data-action="mcp-review">Review received draft</button>' : ''}
  </div>`, null);
};

actions['mcp-copy-url'] = async () => {
  if (!config.mcpUrl) return;
  try {
    await navigator.clipboard.writeText(config.mcpUrl);
    toast('Server URL copied');
  } catch {
    const field = editor.querySelector('#mcp-server-url');
    field?.focus();
    field?.select();
    toast('Copy the server URL from the field.');
  }
};

actions['mcp-review'] = () => {
  if (!pendingDraft) return;
  try {
    aiState = {...aiState, output: pendingDraft, plans: parseAIPlan(pendingDraft), target: null};
    showAIReview();
  } catch (error) {
    toast(error.message);
  }
};

const addReviewedPlan = actions['ai-add'];
actions['ai-add'] = () => {
  const hadPlan = aiState.plans.length > 0;
  const reviewedDraft = pendingDraft && aiState.output === pendingDraft;
  if (reviewedDraft && (accountStarting || (cloud && !cloud.ready))) {
    return toast('Wait for Waystep to finish checking your account, then add the draft.');
  }
  addReviewedPlan();
  if (hadPlan && reviewedDraft && !aiState.plans.length) pendingDraft = undefined;
};

async function readDraft() {
  const prefix = '#draft=';
  if (!location.hash.startsWith(prefix)) return;
  const encoded = location.hash.slice(prefix.length);
  history.replaceState(null, '', location.pathname + location.search);
  try {
    if (!/^[A-Za-z0-9_-]{1,12000}$/.test(encoded)) throw Error();
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const decoder = new TextDecoder('utf-8', {fatal: true});
    let length = 0, draft = '';
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 1_000_000) {
        await reader.cancel();
        throw Error();
      }
      draft += decoder.decode(value, {stream: true});
    }
    pendingDraft = draft + decoder.decode();
    actions['mcp-review']();
  } catch {
    toast('This review link could not be opened. Ask your AI for the plan as JSON and import it.');
  }
}

if (config.firebase?.apiKey) {
  import('./cloud-bundle.js').then(({connect}) => {
    cloud = connect(config.firebase, {
      error: toast,
      refresh() {
        if (cloud?.ready) accountStarting = false;
        render();
      },
      optimistic: next => { trips = next; },
      receive: replaceLibrary, validate: items => validate({trips: items}, true),
      switchLibrary(signedIn) {
        accountStarting = false;
        editor.close();
        active = null;
        filter = 'active';
        query = '';
        if (signedIn) guestTrips = trips;
        else if (storageOK) {
          try {
            const raw = localStorage.getItem(KEY);
            if (raw) guestTrips = validate(JSON.parse(raw), true);
          } catch { toast('Could not reload guest trips from this browser.'); }
        }
        replaceLibrary(signedIn ? [] : guestTrips);
        if (pendingDraft) actions['mcp-review']();
      }
    });
    render();
  }).catch(() => {
    accountStarting = false;
    toast('Cloud sync could not start. Your guest library is available.');
  });
}

window.addEventListener('hashchange', readDraft);
readDraft();
