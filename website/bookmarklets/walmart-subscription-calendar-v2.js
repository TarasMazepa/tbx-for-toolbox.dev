(function() {
    // 1. Enforce starting location
    if (!window.location.href.match(/walmart\.com\/subscriptions\/manage/)) {
        alert("⚠️ Run from Walmart Subscriptions Manage page.");
        return;
    }

    let toast = document.createElement('div');
    toast.innerHTML = '🔄 Scanning...<br><small>Please wait...</small>';
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#0071ce;color:#fff;padding:15px 25px;border-radius:8px;z-index:999999;font-family:sans-serif;font-size:16px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
    document.body.appendChild(toast);

    const currentYear = new Date().getFullYear();
    let today = new Date();
    today.setHours(0,0,0,0);

    // 2. Extract baseline subscription data
    let items = [];

    // Scope to the specific subscriptions container provided in the HTML
    let container = document.querySelector('[data-testid="subscription-items-container"]') || document;
    let cards = container.querySelectorAll('.pv4');

    if (cards.length === 0) {
        toast.remove();
        return alert("⚠️ No subscriptions found.");
    }

    cards.forEach(card => {
        // 1st Priority: The span class. 2nd Priority: The aria-label on the link (highly robust). 3rd: Image Alt.
        let name = '';
        let nameEl = card.querySelector('.ld_AY');
        if (nameEl) name = nameEl.innerText.trim();

        if (!name) {
            let aEl = card.querySelector('a[aria-label]');
            if (aEl) name = aEl.getAttribute('aria-label');
        }

        if (!name) {
            let imgAlt = card.querySelector('img');
            if (imgAlt) name = imgAlt.alt;
        }

        if(!name) return;

        let imgEl = card.querySelector('img');
        let imgSrc = imgEl ? imgEl.src : '';
        if (imgSrc) imgSrc = imgSrc.split('?')[0] + "?odnHeight=80&odnWidth=80&odnBg=FFFFFF";

        let dateStr = '';
        let bEls = card.querySelectorAll('b');
        bEls.forEach(b => {
            if(b.parentNode && b.parentNode.innerText.includes('next delivery')) dateStr = b.innerText.trim();
        });
        if(!dateStr) {
            let spans = card.querySelectorAll('span');
            for(let span of spans) {
                if(span.innerText.includes('next delivery on')) {
                    dateStr = span.innerText.replace('next delivery on', '').trim();
                    break;
                }
            }
        }

        let freqStr = '';
        let spansFreq = card.querySelectorAll('span');
        for(let span of spansFreq) {
            let text = span.innerText.toLowerCase();
            if(text.includes('every ') && !text.includes('delivery')) {
                freqStr = text;
                break;
            }
        }

        if(name && dateStr) items.push({name, imgSrc, date: dateStr, freq: freqStr, allDates: []});
    });

    // 3. Check Orders page for "Processing" subscription shipments
    let ordersWin = window.open('/orders', '_blank');
    if(!ordersWin) {
        toast.remove();
        return alert("⚠️ Pop-up blocked.");
    }

    let maxAttempts = 60;
    let attempts = 0;

    let checkInterval = setInterval(() => {
        attempts++;
        try {
            let doc = ordersWin.document;
            let h2s = doc.querySelectorAll('h2');
            let isLoaded = doc.body && doc.body.innerText.includes('Purchase history');

            if (isLoaded && h2s.length > 0) {
                clearInterval(checkInterval);

                let processingDatesAndItems = [];
                h2s.forEach(h2 => {
                    let headerText = h2.innerText.trim();
                    if (headerText.includes('Arrives') || headerText.includes('Arriving')) {
                        let nextElement = h2.nextElementSibling;
                        let isSub = nextElement && nextElement.innerText.includes('Subscription shipment');

                        if (isSub) {
                            let match = headerText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i);
                            if (match) {
                                let orderDate = match[0];
                                let orderImages = h2.parentElement.querySelectorAll('img');
                                orderImages.forEach(img => {
                                    if(img.alt) processingDatesAndItems.push({ date: orderDate, itemName: img.alt });
                                });
                            }
                        }
                    }
                });

                items.forEach(item => {
                    let cleanSubName = item.name.toLowerCase().substring(0, 15);
                    let foundInOrder = processingDatesAndItems.find(orderItem =>
                        orderItem.itemName.toLowerCase().includes(cleanSubName) ||
                        cleanSubName.includes(orderItem.itemName.toLowerCase().substring(0, 15))
                    );

                    if (foundInOrder) item.processingDate = foundInOrder.date;
                });

                ordersWin.close();
                toast.remove();
                buildCalendar(items);

            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                ordersWin.close();
                toast.remove();
                console.warn("Timeout");
                buildCalendar(items);
            }
        } catch (e) {
            // Ignore cross-origin errors during initial load
        }
    }, 500);

    // 4. Build the calendar
    function buildCalendar(items) {
        items.forEach(item => {
            let startingDateStr = item.processingDate ? item.processingDate : item.date;
            item.dateObj = new Date(`${startingDateStr} ${currentYear}`);

            let mBase = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][item.dateObj.getMonth()];
            let dBase = item.dateObj.getDate().toString().padStart(2, '0');
            item.allDates.push(`${mBase} ${dBase} ${currentYear}`);

            let match = item.freq.match(/every\s+(\d+)?\s*(week|month)s?/i);
            item.freqDays = 9999;

            if (match) {
                let amount = parseInt(match[1]) || 1;
                let unit = match[2].toLowerCase();
                item.freqDays = (unit === 'week') ? amount * 7 : amount * 30;

                let fwdDate = new Date(item.dateObj.getTime());
                for(let i = 0; i < 15; i++) {
                    if (unit === 'week') fwdDate.setDate(fwdDate.getDate() + (amount * 7));
                    else if (unit === 'month') fwdDate.setMonth(fwdDate.getMonth() + amount);

                    let m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][fwdDate.getMonth()];
                    let d = fwdDate.getDate().toString().padStart(2, '0');
                    item.allDates.push(`${m} ${d} ${fwdDate.getFullYear()}`);
                }
            }
            item.earliestFutureTime = item.dateObj.getTime();
        });

        items.sort((a, b) => {
            if (a.earliestFutureTime !== b.earliestFutureTime) return a.earliestFutureTime - b.earliestFutureTime;
            if (a.freqDays !== b.freqDays) return a.freqDays - b.freqDays;
            return a.name.localeCompare(b.name);
        });

        let allExtrapolatedDates = items.flatMap(i => i.allDates);
        let uniqueDates = [...new Set(allExtrapolatedDates)];
        uniqueDates.sort((a, b) => new Date(a) - new Date(b));
        uniqueDates = uniqueDates.filter(d => new Date(d) >= today);

        let maxCols = 5;
        let colDates = uniqueDates.slice(0, maxCols);
        let maxDateObj = new Date(colDates[colDates.length - 1]);

        items.forEach(item => {
            item.nextAfterMax = '';
            for (let d of item.allDates) {
                if (new Date(d) > maxDateObj) {
                    item.nextAfterMax = d;
                    break;
                }
            }
        });

        let html = `<html><head><title>Walmart Subscription Calendar v2</title><style>body{font-family:'Bogle','Helvetica Neue',Helvetica,Arial,sans-serif;padding:20px;color:#2e2f32;max-width:1000px;margin:0 auto}h1{color:#0071ce;margin-bottom:15px;font-size:24px;border-bottom:2px solid #0071ce;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed}th,td{border:1px solid #e3e4e5;padding:4px 6px;text-align:center;font-size:13px;overflow:hidden}th{background:#f4f5f7;font-weight:600;padding:6px}td.n{text-align:left;display:flex;align-items:center;gap:10px;border-bottom:none;border-top:none}tr{border-bottom:1px solid #e3e4e5;page-break-inside:avoid}img{width:36px;height:36px;object-fit:contain;border-radius:4px;background:#fff;flex-shrink:0}.t{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;line-height:1.2}.c{color:#0071ce;font-weight:bold;font-size:1.3em;line-height:1}.f{font-size:11px;color:#777;display:block;margin-top:2px}@media print{body{padding:0;max-width:100%}@page{margin:.4in;size:portrait}}</style></head><body><h1>Subscription Calendar</h1><table><thead><tr><th style="text-align:left;width:50%">Item</th>`;

        colDates.forEach(d => {
            let displayDate = d.split(' ').slice(0, 2).join(' ');
            html += `<th style="width:8%">${displayDate}</th>`;
        });

        html += `<th style="width:10%">Later Dates</th></tr></thead><tbody>`;

        items.forEach(item => {
            html += `<tr><td class="n">`;
            if(item.imgSrc) html += `<img loading="lazy" src="${item.imgSrc}">`;
            let freqDisplay = item.freq ? `<span class="f">${item.freq}</span>` : '';
            html += `<div><span class="t">${item.name}</span>${freqDisplay}</div></td>`;

            colDates.forEach(d => {
                if(item.allDates.includes(d)) html += `<td><span class="c">✓</span></td>`;
                else html += `<td></td>`;
            });

            if(item.nextAfterMax) html += `<td style="color:#555;font-weight:500">${item.nextAfterMax.split(' ').slice(0, 2).join(' ')}</td>`;
            else html += `<td></td>`;

            html += `</tr>`;
        });

        html += `</tbody></table><script>setTimeout(()=>window.print(),500);</script></body></html>`;

        let outWin = window.open('', '_blank');
        if(outWin) {
            outWin.document.write(html);
            outWin.document.close();
        }
    }
})();