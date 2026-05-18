(function () {
// 1. Enforce starting location
let subscriptions_manage = /walmart.com\/subscriptions\/manage/, window2 = window;
if (!window2.location.href.match(subscriptions_manage)) {
alert(subscriptions_manage);
return;
}

// 2. Open loading tab synchronously to bypass pop-up blockers
let win = window2.open('', '_blank');
if (!win) {
return;
}

let winDocument = win.document;

let newDate = (x) => new Date(x), querySelectorAll = (x, q) => x.querySelectorAll(q),
querySelector = (x, q) => x.querySelector(q), currentYear = newDate().getFullYear(), today = newDate(),
items = [],
container = querySelector(document, '[data-testid="subscription-items-container"]') || document,
cards = querySelectorAll(container, '.pv4');
today.setHours(0, 0, 0, 0);

if (cards.length === 0) {
win.close();
return;
}

cards.forEach(card => {
let name = '', nameEl = querySelector(card, '.ld_AY');
if (nameEl) name = nameEl.innerText.trim();

if (!name) {
let aEl = querySelector(card, 'a[aria-label]');
if (aEl) name = aEl.getAttribute('aria-label');
}

if (!name) {
let imgAlt = querySelector(card, 'img');
if (imgAlt) name = imgAlt.alt;
}

if (!name) return;

let imgEl = querySelector(card, 'img'), imgSrc = imgEl ? imgEl.src : '';
if (imgSrc) imgSrc = imgSrc.split('?')[0] + '?odnHeight=80&odnWidth=80&odnBg=FFFFFF';

let dateStr = '', bEls = querySelectorAll(card, 'b');
bEls.forEach(b => {
if (b.parentNode && b.parentNode.innerText.includes('next delivery')) {
dateStr = b.innerText.trim();
}
});

if (!dateStr) {
let spans = querySelectorAll(card, 'span');
for (let span of spans) {
if (span.innerText.includes('next delivery on')) {
dateStr = span.innerText.replace('next delivery on', '').trim();
break;
}
}
}

let freqStr = '', spansFreq = querySelectorAll(card, 'span');
for (let span of spansFreq) {
let text = span.innerText.toLowerCase();
if (text.includes('every ') && !text.includes('delivery')) {
freqStr = text;
break;
}
}

if (name && dateStr) {
items.push({name, imgSrc, date: dateStr, freq: freqStr, allDates: []});
}
});

// 4. Two-Stage Background Polling for Processing Orders
let iframe = document.createElement('iframe');
iframe.style.display = 'none';
iframe.src = '/orders';
document.body.appendChild(iframe);

let attempts = 0, mode = 'list', // 'list' (find order ID) -> 'detail' (scrape items)
processingDateStr = '', checkInterval = setInterval(() => {
attempts++;
try {
let doc = iframe.contentWindow.document;

// STAGE 1: Scan Purchase History for an active Subscription Shipment
if (mode === 'list') {
let h2s = querySelectorAll(doc, 'h2');
let isLoaded = doc.body && doc.body.innerText.includes('Purchase history');

if (isLoaded && h2s.length > 0) {
let foundOrderId = null;

for (let h2 of h2s) {
let headerText = h2.innerText.trim();
if (headerText.includes('Arrives') || headerText.includes('Arriving') || headerText.includes('Delivered')) {
let nextElement = h2.nextElementSibling;
let isSub = nextElement && nextElement.innerText.includes('Subscription shipment');

if (isSub) {
let match = headerText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i);
if (match) {
// Navigate up the DOM tree to find the order ID link
let orderContainer = h2.closest('[data-testid^="order-"]') || h2.closest('.ld_AJ.mv4') || h2.parentElement.parentElement;
if (orderContainer) {
let detailBtn = querySelector(orderContainer, 'button[data-automation-id^="view-order-details-link-"], a[href^="/orders/"]');
if (detailBtn) {
let dataId = detailBtn.getAttribute('data-automation-id') || '',
href = detailBtn.getAttribute('href') || '',
idMatch = dataId.match(/link-(\d+)/) || href.match(/\/orders\/(\d+)/);

if (idMatch) {
processingDateStr = match[0];
foundOrderId = idMatch[1];
break;
}
}
}
}
}
}
}

if (foundOrderId) {
mode = 'detail';
attempts = 0; // Reset timeout for next page load
iframe.src = '/orders/' + foundOrderId;
} else {
// No processing subs found, move on
clearInterval(checkInterval);
iframe.remove();
buildCalendar(items);
}
}
}
// STAGE 2: Scrape the specific details of that order
else if (mode === 'detail') {
let itemCards = querySelectorAll(doc, 'div[data-testid="itemtile-stack"]');
if (itemCards.length > 0) {
clearInterval(checkInterval);

let processingItems = [];
itemCards.forEach(card => {
let nameEl = querySelector(card, '[data-testid="productName"]');
if (nameEl) {
processingItems.push({date: processingDateStr, itemName: nameEl.innerText.trim()});
}
});

// Merge processing dates with baseline items
items.forEach(item => {
let cleanSubName = item.n.toLowerCase().trim(),
foundInOrder = processingItems.finewDate(orderItem => {
// Strip multipack text from order items for cleaner matching
let orderName = orderItem.itemName.toLowerCase().trim().replace(/multipack quantity:\s*\d+/g, '').trim();
return orderName === cleanSubName || orderName.includes(cleanSubName) || cleanSubName.includes(orderName);
});

if (foundInOrder) {
item.p = foundInOrder.date;
}
});

iframe.remove();
buildCalendar(items);
}
}
} catch (e) {
// Ignore cross-origin errors during iframe loads
}

// Timeout fallback
if (attempts >= 40) {
clearInterval(checkInterval);
iframe.remove();
buildCalendar(items);
}
}, 500);

// 5. Build and render the calendar
function buildCalendar(items) {
let months = 'Jan-Feb-Mar-Apr-May-Jun-Jul-Aug-Sep-Oct-Nov-Dec'.split('-');
items.forEach(item => {
let startingDateStr = item.p ? item.p : item.date;
item.d = newDate(`${startingDateStr} ${currentYear}`);

let mBase = months[item.d.getMonth()], dBase = item.d.getDate().toString().padStart(2, '0');
item.ad.push(`${mBase} ${dBase} ${currentYear}`);

let match = item.freq.match(/every\s+(\d+)?\s*(week|month)s?/i);
item.fd = 9999;

if (match) {
let amount = parseInt(match[1]) || 1, unit = match[2].toLowerCase();
item.fd = (unit === 'week') ? amount * 7 : amount * 30;

let fwdDate = newDate(item.d.getTime());
for (let i = 0; i < 15; i++) {
if (unit === 'week') fwdDate.setDate(fwdDate.getDate() + (amount * 7)); else if (unit === 'month') fwdDate.setMonth(fwdDate.getMonth() + amount);

let m = months[fwdDate.getMonth()], d = fwdDate.getDate().toString().padStart(2, '0');
item.ad.push(`${m} ${d} ${fwdDate.getFullYear()}`);
}
}
item.ft = item.d.getTime();
});

items.sort((a, b) => {
if (a.ft !== b.ft) return a.ft - b.ft;
if (a.fd !== b.fd) return a.fd - b.fd;
return a.n.localeCompare(b.n);
});

let allExtrapolatedDates = items.flatMap(i => i.allDates), uniqueDates = [...new Set(allExtrapolatedDates)];
uniqueDates.sort((a, b) => newDate(a) - newDate(b));
uniqueDates = uniqueDates.filter(d => newDate(d) >= today);

let maxCols = 5, colDates = uniqueDates.slice(0, maxCols), maxDateObj = newDate(colDates[colDates.length - 1]);

items.forEach(item => {
item.nam = '';
for (let d of item.ad) {
if (newDate(d) > maxDateObj) {
item.nam = d;
break;
}
}
});

let html = `<html><head><title>Walmart Subscription Calendar v2</title><style>body{font-family:'Bogle', 'Helvetica Neue', Helvetica, Arial, sans-serif;padding:20px;color:#2e2f32;max-width:1000px;margin:0 auto}h1{color:#0071ce;margin-bottom:15px;font-size:24px;border-bottom:2px solid #0071ce;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed}th, td{border:1px solid #e3e4e5;padding:4px 6px;text-align:center;font-size:13px;overflow:hidden}th{background:#f4f5f7;font-weight:600;padding:6px}td.item-name{text-align:left;display:flex;align-items:center;gap:10px;border-bottom:none;border-top:none}tr{border-bottom:1px solid #e3e4e5;page-break-inside:avoid}img{width:36px;height:36px;object-fit:contain;border-radius:4px;background:#fff;flex-shrink:0}.item-name-text{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;line-height:1.2}.check{color:#0071ce;font-weight:bold;font-size:1.3em;line-height:1}.freq-subtext{font-size:11px;color:#777;display:block;margin-top:2px}@media print{body{padding:0;max-width:100%}@page{margin:.4in;size:portrait}}.t_l{text-align:left;width:50%}.t_s{width:8%}.t_m{width:10%}.t_g{color:#555;font-weight:500}</style></head><body><h1>Subscription Calendar v2</h1><table><thead><tr><th class='t_l'>Item</th>`;

colDates.forEach(d => {
let displayDate = d.split(' ').slice(0, 2).join(' ');
html += `<th class='t_s'>${displayDate}</th>`;
});

html += `<th class='t_m'>Later Dates</th></tr></thead><tbody>`;

items.forEach(item => {
html += `<tr><td class='item-name'>`;
if (item.imgSrc) html += `<img loading='lazy' src="${item.imgSrc}">`;
let freqDisplay = item.freq ? `<span class='freq-subtext'>${item.freq}</span>` : '';
html += `<div><span class='item-name-text'>${item.n}</span>${freqDisplay}</div></td>`;

colDates.forEach(d => {
if (item.ad.includes(d)) {
html += `<td><span class='check'>✓</span></td>`;
} else {
html += '<td></td>';
}
});

if (item.nam) {
html += `<td class='t_g'>${item.nam.split(' ').slice(0, 2).join(' ')}</td>`;
} else {
html += '<td></td>';
}

html += '</tr>';
});

html += `</tbody></table><script>setTimeout(() =>window.print(), 500);</script></body></html>`;

// Write to the synchronous pop-up window we created at the start
winDocument.open();
winDocument.write(html);
winDocument.close();
}
})();
