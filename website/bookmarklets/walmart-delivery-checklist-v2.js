(function() { let d=document, q="querySelectorAll", qs="querySelector";
    console.log("🚀 Start");
    // --- ROUTER ---
    if (window.location.href.match(/walmart\.com\/subscriptions\/manage/)) {
        console.log("📍 Subs");
        generateSubscriptionChecklist();
    } else if (window.location.href.match(/walmart\.com\/orders\/\d+/)) {
        console.log("📍 Order");
        generateOrderAudit();
    } else {
        console.error("Not on a valid Walmart page.");
        alert("Run on Orders or Subs page");
    }


    function renderPage(title, headerMain, headerSub, bodyHtml) { return '<html><head><title>'+title+'</title><style>@media print{body{padding:0!important;margin:0!important}}.r{display:flex;align-items:center;padding:12px 0;border-bottom:1px solid #e3e4e5;page-break-inside:avoid}.cb{width:20px;height:20px;border:2px solid #555;border-radius:4px;margin-right:15px;flex-shrink:0}.ic{width:50px;height:50px;margin-right:15px;flex-shrink:0;display:flex;align-items:center;justify-content:center}.tc{flex-grow:1;font-size:16px;color:#2e2f32;line-height:1.3}.img{max-width:100%;max-height:100%;object-fit:contain;border-radius:4px}.q{font-size:16px;min-width:40px;flex-shrink:0}.rm{border-bottom:1px dashed #e3e4e5;opacity:.85}.cbm{border-color:#d32f2f;display:flex;align-items:center;justify-content:center;color:#d32f2f;font-weight:700;font-size:14px}.qm{color:#d32f2f}.im{filter:grayscale(100%)}.sm{font-size:12px;color:#d32f2f;margin-top:2px}.st{font-size:12px;color:#777;margin-top:2px}</style></head><body style="background:#fff;padding:30px;margin:0;font-family:\'Bogle\',sans-serif;color:#2e2f32"><div style="max-width:850px;margin:0 auto"><div style="border-bottom:3px solid #0071ce;padding-bottom:15px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end"><div><h1 style="margin:0 0 8px 0;font-size:26px;font-weight:700;color:#0071ce">'+headerMain+'</h1><div style="font-size:14px;color:#555">'+headerSub+'</div></div></div>'+bodyHtml+'</div><script>setTimeout(()=>window.print(),1500)</script></body></html>'; }

    // ==========================================
    // MODE 1: SUBSCRIPTION CHECKLIST (NEXT DELIVERY ONLY)
    // ==========================================
    function generateSubscriptionChecklist() {
        let cards = d[q]('.pv4');
        if (cards.length === 0) {
            alert("No subs found.");
            return;
        }

        let subsByDate = {};
        let totalActiveSubs = 0;

        cards.forEach(card => {
            let nameEl = card[qs]('.ld_AY');
            let name = nameEl ? nameEl.innerText.trim() : '';
            if (!name) {
                let imgAlt = card[qs]('img');
                if (imgAlt) name = imgAlt.alt;
            }
            if (!name) return;

            let imgEl = card[qs]('img');
            let imgSrc = imgEl ? imgEl.src : '';
            if (imgSrc) {
                imgSrc = imgSrc.split('?')[0] + "?odnHeight=80&odnWidth=80&odnBg=FFFFFF";
            }

            let dateStr = '';
            let bEls = card[q]('b');
            bEls.forEach(b => { if (b.parentNode && b.parentNode.innerText.includes('next delivery')) dateStr = b.innerText.trim(); });

            if (!dateStr) {
                let spans = card[q]('span');
                for (let span of spans) {
                    if (span.innerText.includes('next delivery on')) {
                        dateStr = span.innerText.replace('next delivery on', '').trim();
                        break;
                    }
                }
            }
            if (!dateStr) dateStr = 'Unknown Date';

            let freqStr = '';
            let spansFreq = card[q]('span');
            for (let span of spansFreq) {
                let text = span.innerText.toLowerCase();
                if (text.includes('every ') && !text.includes('delivery')) {
                    freqStr = text; break;
                }
            }

            if (!subsByDate[dateStr]) subsByDate[dateStr] = [];
            subsByDate[dateStr].push({ name, imgSrc, freqStr });
            totalActiveSubs++;
        });

        let win = window.open('', '_blank');
        if (!win) {
            alert("Allow popups");
            return;
        }

        let now = new Date();
        let generatedDateStr = now.toLocaleDateString();
        let timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Sort dates chronologically to find the closest one
        let sortedDates = Object.keys(subsByDate).sort((a, b) => {
            if (a === 'Unknown Date') return 1;
            if (b === 'Unknown Date') return -1;
            const currentYear = new Date().getFullYear();
            return new Date(`${a} ${currentYear}`) - new Date(`${b} ${currentYear}`);
        });

        // Get ONLY the closest upcoming date
        let closestDate = sortedDates[0];
        let closestItems = subsByDate[closestDate];

        let contentHtml = `<h2 style="margin:30px 0 10px 0;font-size:20px;color:#0071ce;border-bottom:2px solid #0071ce;padding-bottom:5px">Upcoming Delivery: ${closestDate}</h2>`;

        closestItems.forEach(sub => {
            contentHtml += `<div class="r"><div class="cb"></div><div class="ic">${sub.imgSrc ?`<img src="${sub.imgSrc}" class="img" />`: ''}</div><div class="tc">${sub.name}<div class="st">${sub.freqStr}</div></div></div>`;
        });

        win.document.write(renderPage(`Next Subscription Delivery ${generatedDateStr}`, `Next Subscription Checklist`, `<strong>${closestItems.length} Items</strong> in this delivery &nbsp;|&nbsp; <strong>${totalActiveSubs}</strong> Total Active Subs<br><span style="color:#777;font-size:12px;margin-top:4px;display:inline-block">Generated: ${generatedDateStr} ${timeStr}</span>`, `${contentHtml}`));
        win.document.close();
        console.log("✅ Done");
    }

    // ==========================================
    // MODE 2: ORDER AUDIT
    // ==========================================
    function generateOrderAudit() {
        let toast = d.createElement('div');
        toast.innerHTML = '🔄 Processing...';
        toast.style.cssText='position:fixed;bottom:20px;right:20px;background:#0071ce;color:#fff;padding:15px 25px;border-radius:8px;z-index:999999;font-family:sans-serif;font-size:16px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.2)';
        d.body.appendChild(toast);

        let orderNum = '';
        let spans = d[q]('span');
        for (let span of spans) {
            if (span.innerText.includes('Order#')) {
                orderNum = span.innerText.trim();
                break;
            }
        }

        let deliveryStatus = '';
        let orderDateStr = '';
        let h2s = d[q]('h2');
        for (let h2 of h2s) {
            if (h2.innerText.includes('Delivered') || h2.innerText.includes('Arriving') || h2.innerText.includes('Arrives') || h2.innerText.includes('Delivery')) {
                deliveryStatus = h2.innerText.trim();
                let match = deliveryStatus.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i);
                if (match) orderDateStr = match[0];
                break;
            }
        }

        if (!orderDateStr) {
            toast.remove();
            alert("No date");
            return;
        }

        const currentYear = new Date().getFullYear();
        let targetDate = new Date(`${orderDateStr} ${currentYear}`);
        console.log(`📅 ${orderDateStr}`);

        let itemCards = d[q]('div[data-testid="itemtile-stack"]');
        let orderItemsHtml = [];
        let orderItemNames = [];

        itemCards.forEach(card => {
            let nameEl = card[qs]('div[data-testid="productName"]');
            if (!nameEl) return;
            let name = nameEl.innerText.trim();
            orderItemNames.push(name.toLowerCase());

            let qtyEl = card[qs]('.bill-item-quantity');
            let qty = qtyEl ? qtyEl.innerText.trim().replace(/Qty\s*/i, '') : '1';
            let imgEl = card[qs]('img[data-testid="productTileImage"]') || card[qs]('div[data-testid="product-image"] img:not([alt="Subscription icon"])');
            let imgSrc = imgEl ? imgEl.src : '';

            orderItemsHtml.push(`<div class="r"><div class="cb"></div><div class="q">${qty}x</div><div class="ic">${imgSrc ?`<img src="${imgSrc}" class="img" />`: ''}</div><div class="tc">${name}</div></div>`);
        });

        console.log(`📦 ${orderItemNames.length} items`);

        let subWin = window.open('/subscriptions/manage', '_blank');
        if (!subWin) {
            toast.remove();

            alert("Allow popups");
            return;
        }

        console.log("➡️ Wait React");

        let maxAttempts = 60;
        let attempts = 0;
        let prevCardCount = 0;
        let stableCount = 0;

        let checkInterval = setInterval(() => {
            attempts++;
            try {
                let doc = subWin.document;
                let cards = doc[q]('.pv4');

                if (cards.length > 0) {
                    if (cards.length === prevCardCount) {
                        stableCount++;
                    } else {
                        console.log(`📈 ${cards.length} load`);
                        prevCardCount = cards.length;
                        stableCount = 0;
                    }

                    if (stableCount >= 3) {
                        clearInterval(checkInterval);
                        console.log(`✅ ${cards.length}`);

                        let subs = [];
                        cards.forEach(card => {
                            let nameEl = card[qs]('.ld_AY');
                            let name = nameEl ? nameEl.innerText.trim() : '';
                            if (!name) {
                                let imgAlt = card[qs]('img');
                                if (imgAlt) name = imgAlt.alt;
                            }
                            if (!name) return;

                            let imgEl = card[qs]('img');
                            let imgSrc = imgEl ? imgEl.src : '';
                            if (imgSrc) imgSrc = imgSrc.split('?')[0] + "?odnHeight=80&odnWidth=80&odnBg=FFFFFF";

                            let dateStr = '';
                            let bEls = card[q]('b');
                            bEls.forEach(b => { if (b.parentNode && b.parentNode.innerText.includes('next delivery')) dateStr = b.innerText.trim(); });

                            if (!dateStr) {
                                let spans = card[q]('span');
                                for (let span of spans) {
                                    if (span.innerText.includes('next delivery on')) {
                                        dateStr = span.innerText.replace('next delivery on', '').trim();
                                        break;
                                    }
                                }
                            }

                            let freqStr = '';
                            let spansFreq = card[q]('span');
                            for (let span of spansFreq) {
                                let text = span.innerText.toLowerCase();
                                if (text.includes('every ') && !text.includes('delivery')) {
                                    freqStr = text; break;
                                }
                            }

                            if (name && dateStr) subs.push({ name, imgSrc, date: dateStr, freq: freqStr });
                        });

                        console.log("📋 Raw:");
                        console.table(subs);

                        let missingItemsHtml = [];
                        let expectedConsole = [];

                        subs.forEach(sub => {
                            let subDate = new Date(`${sub.date} ${currentYear}`);
                            let match = sub.freq.match(/every\s+(\d+)?\s*(week|month)s?/i);
                            let isExpected = false;

                            if (match) {
                                let amount = parseInt(match[1]) || 1;
                                let unit = match[2].toLowerCase();
                                let tempDate = new Date(subDate.getTime());

                                for(let i = 0; i < 20; i++) {
                                    let diffDays = Math.abs((tempDate - targetDate) / (1000 * 60 * 60 * 24));

                                    if (diffDays <= 4) {
                                        isExpected = true;
                                        break;
                                    }
                                    if (tempDate < targetDate && diffDays > 30) {
                                        break;
                                    }

                                    if (unit === 'week') tempDate.setDate(tempDate.getDate() - (amount * 7));
                                    else if (unit === 'month') tempDate.setMonth(tempDate.getMonth() - amount);
                                }
                            }

                            if (isExpected) {
                                expectedConsole.push({ Name: sub.name, Frequency: sub.freq, NextDelivery: sub.date });
                                let cleanSubName = sub.name.toLowerCase().substring(0, 15);
                                let found = orderItemNames.some(orderName => orderName.includes(cleanSubName) || cleanSubName.includes(orderName.substring(0, 15)));

                                if (!found) {
                                    missingItemsHtml.push(`<div class="r rm"><div class="cb cbm">!</div><div class="q qm">--</div><div class="ic">${sub.imgSrc ?`<img src="${sub.imgSrc}" class="img im" />`: ''}</div><div class="tc">${sub.name}<div class="sm">Expected on ${orderDateStr} (Based on: ${sub.freq}, next delivery ${sub.date})</div></div></div>`);
                                }
                            }
                        });

                        console.log(`🎯 Expected (${orderDateStr}):`);
                        if (expectedConsole.length > 0) {
                            console.table(expectedConsole);
                        } else {
                            console.log("(No exp)");
                        }

                        toast.remove();

                        let now = new Date();
                        let dateStr = now.toLocaleDateString();
                        let timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                        let missingSection = missingItemsHtml.length > 0
                            ? `<h2 style="margin:30px 0 10px 0;font-size:20px;color:#d32f2f;border-bottom:2px solid #d32f2f;padding-bottom:5px">⚠️ Missing/Expected Subs</h2><div style="background:#fff8f8;padding:10px;border-radius:4px;border:1px solid #ffebee;margin-bottom:15px;font-size:13px;color:#b71c1c"><strong>Note:</strong> Calculated from current schedule; may be inaccurate for past orders.</div>${missingItemsHtml.join('')}`
                            : `<h2 style="margin:30px 0 10px 0;font-size:20px;color:#2e8b57;border-bottom:2px solid #2e8b57;padding-bottom:5px">✓ All Subs Accounted</h2>`;

                        subWin.document.open();
                        subWin.document.write(renderPage(`Walmart Delivery Audit ${dateStr}`, `Delivery Checklist & Audit`, `<strong>${orderNum || 'Walmart Order'}</strong> &nbsp;|&nbsp; ${deliveryStatus} &nbsp;|&nbsp; <strong>${orderItemNames.length} Items Delivered</strong><br><span style="color:#777;font-size:12px;margin-top:4px;display:inline-block">Generated: ${dateStr} ${timeStr}</span>`, `<h2 style="margin:0 0 10px 0;font-size:20px;color:#2e2f32">Delivered Items</h2><div>${orderItemsHtml.join('')}</div>${missingSection}`));
                        subWin.document.close();

                    }
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    subWin.close();
                    toast.remove();
                    console.error("❌ Timeout waiting for subscriptions to load.");
                    alert("Timeout");
                }
            } catch (e) {
                // Ignore temporary cross-origin exceptions while the tab redirects
            }
        }, 500);
    }
})();
