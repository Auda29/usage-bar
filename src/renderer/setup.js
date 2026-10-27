const api = window.usageBar;
const container = document.getElementById('provider-settings');
const message = document.getElementById('setup-message');
let setupState;
let currentState;

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function notify(text, error = false) { message.textContent = text; message.classList.toggle('error', error); }
function updateStatuses() {
  if (!setupState) return;
  for (const provider of setupState.catalog) {
    const checkbox = document.getElementById(`enable-${provider.id}`);
    if (checkbox) checkbox.checked = (currentState?.settings || setupState.settings).providers.includes(provider.id);
    const credential = setupState.credentials[provider.id];
    const result = currentState?.providers.find(({ id }) => id === provider.id);
    const enabled = checkbox?.checked;
    const error = enabled && result?.error || credential?.error;
    const identity = credential?.login ? `Konto ${credential.login}` : '';
    document.getElementById(`status-${provider.id}`).textContent = error
      ? [identity, error].filter(Boolean).join(' · ')
      : credential?.available ? `${identity || 'Anmeldung gefunden'} · ${credential.source}` : 'Noch nicht eingerichtet';
  }
}
function updateCopilotAccounts() {
  const select = document.getElementById('copilot-account');
  if (!select) return;
  const selected = setupState.selectedCopilotAccount || 'automatic';
  select.replaceChildren();
  const option = (value, text, disabled = false) => {
    const item = make('option', '', text); item.value = value; item.disabled = disabled;
    select.append(item);
  };
  option('automatic', 'Automatisch erkennen');
  if (selected === 'saved-token') option('saved-token', 'Manuell gespeicherter Token');
  const accounts = setupState.copilotAccounts || [];
  for (const account of accounts) option(`github-cli:${account.login}`, `${account.login} · GitHub CLI${account.available ? '' : ' · Anmeldung erneuern'}`, !account.available);
  if (selected.startsWith('github-cli:') && !accounts.some(({ login }) => selected === `github-cli:${login}`)) {
    option(selected, `${selected.slice('github-cli:'.length)} · Nicht verfügbar`, true);
  }
  select.value = selected;
}
async function action(button, task, success) {
  button.disabled = true;
  try {
    const result = await task();
    if (!result.ok) { notify(result.error || 'Aktion fehlgeschlagen.', true); return false; }
    notify(success);
    setupState = await api.getSetupState();
    updateStatuses();
    updateCopilotAccounts();
    return true;
  } catch { notify('Aktion fehlgeschlagen. Bitte erneut versuchen.', true); return false; }
  finally { button.disabled = false; }
}
function render() {
  container.replaceChildren();
  for (const provider of setupState.catalog) {
    const section = make('section', 'provider-setting');
    section.dataset.provider = provider.id;
    const choice = make('label', 'provider-choice');
    const checkbox = make('input');
    checkbox.type = 'checkbox'; checkbox.id = `enable-${provider.id}`;
    checkbox.checked = setupState.settings.providers.includes(provider.id);
    const logo = make('img', 'provider-logo'); logo.src = `../../assets/${provider.id}.svg`; logo.alt = '';
    choice.append(checkbox, logo, make('span', '', provider.name));
    const status = make('p', 'credential-status'); status.id = `status-${provider.id}`;
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      try {
        const ids = [...container.querySelectorAll('input[type="checkbox"]:checked')].map((item) => item.id.replace('enable-', ''));
        setupState.settings = await api.setProviders(ids);
        notify('Auswahl gespeichert.');
      } catch { checkbox.checked = !checkbox.checked; notify('Auswahl konnte nicht gespeichert werden.', true); }
      finally { checkbox.disabled = false; }
    });
    const details = make('details', 'provider-details');
    details.append(make('summary', '', 'Anmeldung und Einrichtung'), make('p', '', provider.help));
    const actions = make('div', 'setup-actions');
    if (provider.canImport) {
      const importButton = make('button', 'setup-button', 'Cursor-Anmeldung importieren');
      importButton.type = 'button';
      importButton.addEventListener('click', () => action(importButton, () => api.importCursor(), 'Cursor-Anmeldung verbunden. Die App liest sie künftig nur.'));
      actions.append(importButton);
    }
    const website = make('button', 'setup-button subtle', 'Provider-Seite öffnen'); website.type = 'button';
    website.addEventListener('click', () => api.openProvider(provider.id)); actions.append(website);
    details.append(actions);
    section.append(choice, status);
    if (provider.id === 'claude') {
      const login = make('button', 'setup-button', 'Mit Claude Code anmelden'); login.type = 'button'; login.id = 'claude-sign-in';
      login.addEventListener('click', () => {
        notify('Claude-Anmeldung im Browser bestätigen. Das kann einige Minuten dauern.');
        return action(login, () => api.signInClaude(), 'Claude-Anmeldung gespeichert. Usage wird neu geladen.');
      });
      section.append(login);
    }
    if (provider.id === 'copilot') {
      const accountPicker = make('div', 'account-picker');
      const label = make('label', '', 'GitHub-Konto für Usage Bar'); label.htmlFor = 'copilot-account';
      const controls = make('div', 'account-controls');
      const select = make('select'); select.id = label.htmlFor; select.setAttribute('aria-describedby', 'copilot-account-help');
      select.addEventListener('change', async () => {
        const selection = select.value;
        await action(select, () => api.selectCopilotAccount(selection), 'GitHub-Konto für Usage Bar gespeichert.');
        updateCopilotAccounts();
      });
      const reload = make('button', 'setup-button', 'Konten neu laden'); reload.type = 'button';
      reload.addEventListener('click', () => action(reload, async () => ({ ok: true }), 'GitHub-Konten aktualisiert.'));
      controls.append(select, reload);
      const help = make('p', '', 'Die Kontoauswahl gilt nur für Usage Bar. Weitere Konten zuerst in der GitHub CLI anmelden, danach hier neu laden. Alternativ unten einen Token speichern.'); help.id = 'copilot-account-help';
      const command = make('code', 'account-command', 'gh auth login --hostname github.com --web');
      accountPicker.append(label, controls, help, command);
      section.append(accountPicker);
    }
    if (provider.tokenLabel) {
      const form = make('form', 'token-form');
      const label = make('label', '', provider.tokenLabel); label.htmlFor = `token-${provider.id}`;
      const controls = make('div', 'token-controls');
      const input = make('input'); input.type = 'password'; input.id = label.htmlFor; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 16384; input.placeholder = 'Neuen Token eingeben'; input.required = true;
      const save = make('button', 'setup-button', 'Speichern'); save.type = 'submit';
      controls.append(input, save); form.append(label, controls);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const token = input.value;
        if (await action(save, () => api.saveCredential(provider.id, token), 'Token verschlüsselt gespeichert.')) input.value = '';
      });
      const remove = make('button', 'setup-button subtle', 'Gespeicherte Anmeldung entfernen'); remove.type = 'button';
      remove.addEventListener('click', () => action(remove, () => api.removeCredential(provider.id), 'Gespeicherte Anmeldung entfernt. Automatische Anmeldequellen bleiben verfügbar.'));
      details.append(form, remove);
    }
    section.append(details); container.append(section);
  }
  updateStatuses();
  updateCopilotAccounts();
}
if (api) {
  api.onState((next) => { currentState = next; updateStatuses(); });
  api.getSetupState().then((value) => { setupState = value; render(); }).catch(() => notify('Einrichtung konnte nicht geladen werden.', true));
} else if (window.usageBarSetupPreview) { setupState = window.usageBarSetupPreview; render(); }
