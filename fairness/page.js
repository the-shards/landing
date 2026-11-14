import { percent, verifyReceipt } from './verify.js';

const $ = (id) => document.getElementById(id);

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function cap(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function renderOdds(published) {
  const { spec } = published;
  const table = $('odds-table');
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  head.insertCell().outerHTML = '<th scope="col">Egg</th>';
  for (const tier of spec.tiers) head.insertCell().outerHTML = `<th scope="col">${cap(tier)}</th>`;
  const body = table.createTBody();
  for (const egg of spec.tiers) {
    const row = body.insertRow();
    row.insertCell().outerHTML = `<th scope="row">${cap(egg)} egg</th>`;
    spec.table[egg].forEach((units, i) => {
      const cell = row.insertCell();
      cell.textContent = percent(units, spec.total);
      if (spec.tiers[i] === egg) cell.className = 'big';
    });
  }
  $('spec-line').textContent = `Rules version ${published.version}. Fingerprint of these rules: ${published.spec_hash.slice(0, 16)}... (the verifier checks it).`;
  $('algorithm').textContent = spec.algorithm;
}

function showResult(out) {
  const box = $('result');
  box.hidden = false;
  box.className = `result ${out.ok ? 'ok' : 'bad'}`;
  box.replaceChildren();
  const h = document.createElement('h3');
  h.textContent = out.ok ? 'Fair: this roll checks out.' : 'This roll did not verify.';
  box.append(h);
  const list = document.createElement('ul');
  for (const check of out.checks) {
    const li = document.createElement('li');
    li.className = check.ok ? 'pass' : 'fail';
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = check.ok ? '[OK]' : '[X]';
    const text = document.createElement('span');
    text.textContent = check.text;
    li.append(mark, text);
    list.append(li);
  }
  box.append(list);
}

async function main() {
  let published;
  try {
    published = await loadJson('/fairness/spec.json');
    renderOdds(published);
  } catch (e) {
    $('odds-table').replaceChildren();
    $('spec-line').textContent = `Could not load the published odds (${e.message}).`;
    $('verify-btn').disabled = true;
    return;
  }

  $('verify-btn').addEventListener('click', async () => {
    let receipt;
    try {
      receipt = JSON.parse($('receipt').value.trim());
    } catch {
      showResult({ ok: false, checks: [{ ok: false, text: 'That is not valid JSON. Paste the whole receipt exactly as the game copied it.' }] });
      return;
    }
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
      showResult({ ok: false, checks: [{ ok: false, text: 'Your browser cannot run the check here (it needs a secure page). Open this page over https.' }] });
      return;
    }
    showResult(await verifyReceipt(published, receipt));
  });

  $('sample-btn').addEventListener('click', async () => {
    $('receipt').value = JSON.stringify(await loadJson('/fairness/sample-receipt.json'), null, 2);
    $('verify-btn').click();
  });
}

main();
