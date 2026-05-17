(function () {
    var D = document;
    // 1. Enforce starting location
    if (!window.location.href.match(/walmart\.com\/subscriptions\/manage/)) {
        alert("⚠️ Run from Walmart Subscriptions Manage page.");
        return;
    }

    // 2. Open loading tab synchronously to bypass pop-up blockers
    var win = window.open('', '_blank');
    if (!win) {
        alert("⚠️ Pop-up blocked.");
        return;
    }

    win.document.write(`<html><body style="font-family:sans-serif;padding:40px;color:#2e2f32"><h2 style="color:#0071ce">🔄 Scanning Subscriptions & Orders...</h2><p>Please wait while we check for processing shipments...</p></body></html>`);

    var currentYear = new Date().getFullYear();
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    // 3. Extract baseline subscription data
    var items = [];
    var container = D.querySelector('[data-testid="subscription-items-container"]') || document;
    var cards = container.querySelectorAll('.pv4');

    if (cards.length === 0) {
        win.close();
        return alert("⚠️ No subscriptions found.");
    }

    cards.forEach(card => {
        var name = '';
        var nameEl = card.querySelector('.ld_AY');
        if (nameEl) name = nameEl.innerText.trim();

        if (!name) {
            var aEl = card.querySelector('a[aria-label]');
            if (aEl) name = aEl.getAttribute('aria-label');
        }

        if (!name) {
            var imgAlt = card.querySelector('img');
            if (imgAlt) name = imgAlt.alt;
        }

        if (!name) return;

        var imgEl = card.querySelector('img');
        var imgSrc = imgEl ? imgEl.src : '';
        if (imgSrc) imgSrc = imgSrc.split('?')[0] + "?odnHeight=80&odnWidth=80&odnBg=FFFFFF";

        var dateStr = '';
        var bEls = card.querySelectorAll('b');
        bEls.forEach(b => {
            if (b.parentNode && b.parentNode.innerText.includes('next delivery')) {
                dateStr = b.innerText.trim();
            }
        });

        if (!dateStr) {
            var spans = card.querySelectorAll('span');
            for (var span of spans) {
                if (span.innerText.includes('next delivery on')) {
                    dateStr = span.innerText.replace('next delivery on', '').trim();
                    break;
                }
            }
        }

        var freqStr = '';
        var spansFreq = card.querySelectorAll('span');
        for (var span of spansFreq) {
            var text = span.innerText.toLowerCase();
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
    var iframe = D.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = '/orders';
    D.body.appendChild(iframe);

    var attempts = 0;
    var mode = 'list'; // 'list' (find order ID) -> 'detail' (scrape items)
    var processingDateStr = '';

    var checkInterval = setInterval(() => {
        attempts++;
        try {
            var doc = iframe.contentWindow.document;

    // STAGE 1: Scan Purchase History for an active Subscription Shipment
            if (mode === 'list') {
                var h2s = doc.querySelectorAll('h2');
                var isLoaded = doc.body && doc.body.innerText.includes('Purchase history');

                if (isLoaded && h2s.length > 0) {
                    var foundOrderId = null;

                    for (var h2 of h2s) {
                        var headerText = h2.innerText.trim();
                        if (headerText.includes('Arrives') || headerText.includes('Arriving') || headerText.includes('Delivered')) {
                            var nextElement = h2.nextElementSibling;
                            var isSub = nextElement && nextElement.innerText.includes('Subscription shipment');

                            if (isSub) {
                                var match = headerText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i);
                                if (match) {
                                    // Navigate up the DOM tree to find the order ID link
                                    var orderContainer = h2.closest('[data-testid^="order-"]') || h2.closest('.ld_AJ.mv4') || h2.parentElement.parentElement;
                                    if (orderContainer) {
                                        var detailBtn = orderContainer.querySelector('button[data-automation-id^="view-order-details-link-"], a[href^="/orders/"]');
                                        if (detailBtn) {
                                            var dataId = detailBtn.getAttribute('data-automation-id') || '';
                                            var href = detailBtn.getAttribute('href') || '';
                                            var idMatch = dataId.match(/link-(\d+)/) || href.match(/\/orders\/(\d+)/);

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
                var itemCards = doc.querySelectorAll('div[data-testid="itemtile-stack"]');
                if (itemCards.length > 0) {
                    clearInterval(checkInterval);

                    var processingItems = [];
                    itemCards.forEach(card => {
                        var nameEl = card.querySelector('[data-testid="productName"]');
                        if (nameEl) {
                            processingItems.push({date: processingDateStr, itemName: nameEl.innerText.trim()});
                        }
                    });

                    // Merge processing dates with baseline items
                    items.forEach(item => {
                        var cleanSubName = item.name.toLowerCase().trim();

                        var foundInOrder = processingItems.find(orderItem => {
                            // Strip multipack text from order items for cleaner matching
                            var orderName = orderItem.itemName.toLowerCase().trim().replace(/multipack quantity:\s*\d+/g, '').trim();
                            return orderName === cleanSubName || orderName.includes(cleanSubName) || cleanSubName.includes(orderName);
                        });

                        if (foundInOrder) {
                            item.processingDate = foundInOrder.date;
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
            console.warn("Timeout");
            buildCalendar(items);
        }
    }, 500);

    // 5. Build and render the calendar
    function buildCalendar(items) {
        items.forEach(item => {
            var startingDateStr = item.processingDate ? item.processingDate : item.date;
            item.dateObj = new Date(`${startingDateStr} ${currentYear}`);

            var mBase = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][item.dateObj.getMonth()];
            var dBase = item.dateObj.getDate().toString().padStart(2, '0');
            item.allDates.push(`${mBase} ${dBase} ${currentYear}`);

            var match = item.freq.match(/every\s+(\d+)?\s*(week|month)s?/i);
            item.freqDays = 9999;

            if (match) {
                var amount = parseInt(match[1]) || 1;
                var unit = match[2].toLowerCase();
                item.freqDays = (unit === 'week') ? amount * 7 : amount * 30;

                var fwdDate = new Date(item.dateObj.getTime());
                for (var i = 0; i < 15; i++) {
                    if (unit === 'week') fwdDate.setDate(fwdDate.getDate() + (amount * 7)); else if (unit === 'month') fwdDate.setMonth(fwdDate.getMonth() + amount);

                    var m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][fwdDate.getMonth()];
                    var d = fwdDate.getDate().toString().padStart(2, '0');
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

        var allExtrapolatedDates = items.flatMap(i => i.allDates);
        var uniqueDates = [...new Set(allExtrapolatedDates)];
        uniqueDates.sort((a, b) => new Date(a) - new Date(b));
        uniqueDates = uniqueDates.filter(d => new Date(d) >= today);

        var maxCols = 5;
        var colDates = uniqueDates.slice(0, maxCols);
        var maxDateObj = new Date(colDates[colDates.length - 1]);

        items.forEach(item => {
            item.nextAfterMax = '';
            for (var d of item.allDates) {
                if (new Date(d) > maxDateObj) {
                    item.nextAfterMax = d;
                    break;
                }
            }
        });

        var html = `<html><head><title>Walmart Subscription Calendar v2</title><style></style></head><body><h1>Subscription Calendar v2</h1><table><thead><tr><th style="text-align:left;width:50%">Item</th>`;

        colDates.forEach(d => {
            var displayDate = d.split(' ').slice(0, 2).join(' ');
            html += `<th style="width:8%">${displayDate}</th>`;
        });

        html += `<th style="width:10%">Later Dates</th></tr></thead><tbody>`;

        items.forEach(item => {
            html += `<tr><td class="n">`;
            if (item.imgSrc) html += `<img loading="lazy" src="${item.imgSrc}">`;

            html += `<div><span class="t">${item.name}</span>${item.freq ? `<span class="f">${item.freq}</span>` : ''}</div></td>`;

            colDates.forEach(d => {
                if (item.allDates.includes(d)) {
                    html += `<td><span class="c">✓</span></td>`;
                } else {
                    html += `<td></td>`;
                }
            });

            if (item.nextAfterMax) {
                html += `<td >${item.nextAfterMax.split(' ').slice(0, 2).join(' ')}</td>`;
            } else {
                html += `<td></td>`;
            }

            html += `</tr>`;
        });

        html += `</tbody></table><script>setTimeout(()=>window.print(),500);</script></body></html>`;

        // Write to the synchronous pop-up window we created at the start
        win.document.open();
        win.document.write(html);
        win.document.close();
    }
})();
