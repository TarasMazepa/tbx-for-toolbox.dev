(function() {
    console.log("%c=====================================", "color:#0071ce; font-weight:bold;");
    console.log("%c🚀 Starting Walmart Delivery Tool...", "color:#0071ce; font-weight:bold; font-size:14px;");
    console.log("%c=====================================", "color:#0071ce; font-weight:bold;");

    // --- ROUTER ---
    if (window.location.href.match(/walmart\.com\/subscriptions\/manage/)) {
        console.log("📍 Detected Subscriptions Page. Generating Upcoming Checklist...");
        generateSubscriptionChecklist();
    } else if (window.location.href.match(/walmart\.com\/orders\/\d+/)) {
        console.log("📍 Detected Order Page. Running Delivery Audit...");
        generateOrderAudit();
    } else {
        console.error("Not on a valid Walmart page.");
        alert("⚠️ Please run this from a Walmart Order Details page OR your Subscriptions Management page.");
    }

    // ==========================================
    // MODE 1: SUBSCRIPTION CHECKLIST (NEXT DELIVERY ONLY)
    // ==========================================
    function generateSubscriptionChecklist() {
        let cards = document.querySelectorAll('.pv4');
        if (cards.length === 0) {
            alert("⚠️ No subscriptions found on this page. Make sure they have loaded.");
            return;
        }

        let subsByDate = {};
        let totalActiveSubs = 0;

        cards.forEach(card => {
            let nameEl = card.querySelector('.ld_AY');
            let name = nameEl ? nameEl.innerText.trim() : '';
            if (!name) {
                let imgAlt = card.querySelector('img');
                if (imgAlt) name = imgAlt.alt;
            }
            if (!name) return;

            let imgEl = card.querySelector('img');
            let imgSrc = imgEl ? imgEl.src : '';
            if (imgSrc) {
                imgSrc = imgSrc.split('?')[0] + "?odnHeight=80&odnWidth=80&odnBg=FFFFFF";
            }

            let dateStr = '';
            let bEls = card.querySelectorAll('b');
            bEls.forEach(b => { if (b.parentNode && b.parentNode.innerText.includes('next delivery')) dateStr = b.innerText.trim(); });

            if (!dateStr) {
                let spans = card.querySelectorAll('span');
                for (let span of spans) {
                    if (span.innerText.includes('next delivery on')) {
                        dateStr = span.innerText.replace('next delivery on', '').trim();
                        break;
                    }
                }
            }
            if (!dateStr) dateStr = 'Unknown Date';

            let freqStr = '';
            let spansFreq = card.querySelectorAll('span');
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
            alert("⚠️ Your browser blocked the pop-up. Please allow pop-ups for Walmart.com.");
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

        let contentHtml = `<h2 style="margin: 30px 0 10px 0; font-size:20px; color:#0071ce; border-bottom: 2px solid #0071ce; padding-bottom:5px;">Upcoming Delivery: ${closestDate}</h2>`;

        closestItems.forEach(sub => {
            contentHtml += `
                <div style="display:flex; align-items:center; padding:12px 0; border-bottom:1px solid #e3e4e5; page-break-inside: avoid;">
                    <div style="width:20px; height:20px; border:2px solid #555; border-radius:4px; margin-right:15px; flex-shrink:0;"></div>
                    <div style="width:50px; height:50px; margin-right:15px; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                        ${sub.imgSrc ? `<img src="${sub.imgSrc}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:4px;" />` : ''}
                    </div>
                    <div style="flex-grow:1; font-size:16px; color:#2e2f32; line-height:1.3;">
                        ${sub.name}
                        <div style="font-size:12px; color:#777; margin-top:2px;">${sub.freqStr}</div>
                    </div>
                </div>
            `;
        });

        win.document.write(`
            <html>
            <head>
                <title>Next Subscription Delivery ${generatedDateStr}</title>
                <style>@media print { body { padding: 0 !important; margin: 0 !important; } }</style>
            </head>
            <body style="background-color:#fff; padding:30px; margin:0; font-family:'Bogle', 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#2e2f32;">
                <div style="max-width:850px; margin:0 auto;">
                    <div style="border-bottom:3px solid #0071ce; padding-bottom:15px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-end;">
                        <div>
                            <h1 style="margin:0 0 8px 0; font-size:26px; font-weight:700; color:#0071ce;">Next Subscription Checklist</h1>
                            <div style="font-size:14px; color:#555;">
                                <strong>${closestItems.length} Items</strong> in this delivery &nbsp;|&nbsp; <strong>${totalActiveSubs}</strong> Total Active Subs
                                <br><span style="color:#777; font-size:12px; margin-top:4px; display:inline-block;">Generated: ${generatedDateStr} ${timeStr}</span>
                            </div>
                        </div>
                    </div>
                    ${contentHtml}
                </div>
                <script>setTimeout(() => window.print(), 1000);</script>
            </body>
            </html>
        `);
        win.document.close();
        console.log("✅ Subscriptions checklist generated successfully.");
    }

    // ==========================================
    // MODE 2: ORDER AUDIT
    // ==========================================
    function generateOrderAudit() {
        let toast = document.createElement('div');
        toast.innerHTML = '🔄 Processing Subscriptions... Please wait...<br><small style="font-weight:normal; opacity:0.9;">(Check Original Tab Console for logs)</small>';
        toast.style.cssText = 'position:fixed; bottom:20px; right:20px; background:#0071ce; color:#fff; padding:15px 25px; border-radius:8px; z-index:999999; font-family:-apple-system, sans-serif; font-size:16px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.2);';
        document.body.appendChild(toast);

        let orderNum = '';
        let spans = document.querySelectorAll('span');
        for (let span of spans) {
            if (span.innerText.includes('Order#')) {
                orderNum = span.innerText.trim();
                break;
            }
        }

        let deliveryStatus = '';
        let orderDateStr = '';
        let h2s = document.querySelectorAll('h2');
        for (let h2 of h2s) {
            if (h2.innerText.includes('Delivered') || h2.innerText.includes('Arriving') || h2.innerText.includes('Delivery')) {
                deliveryStatus = h2.innerText.trim();
                let match = deliveryStatus.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i);
                if (match) orderDateStr = match[0];
                break;
            }
        }

        if (!orderDateStr) {
            toast.remove();
            alert("Could not detect delivery date.");
            return;
        }

        const currentYear = new Date().getFullYear();
        let targetDate = new Date(`${orderDateStr} ${currentYear}`);
        console.log(`📅 Target Order Date: ${orderDateStr} ${currentYear}`);

        let itemCards = document.querySelectorAll('div[data-testid="itemtile-stack"]');
        let orderItemsHtml = [];
        let orderItemNames = [];

        itemCards.forEach(card => {
            let nameEl = card.querySelector('div[data-testid="productName"]');
            if (!nameEl) return;
            let name = nameEl.innerText.trim();
            orderItemNames.push(name.toLowerCase());

            let qtyEl = card.querySelector('.bill-item-quantity');
            let qty = qtyEl ? qtyEl.innerText.trim().replace(/Qty\s*/i, '') : '1';
            let imgEl = card.querySelector('img[data-testid="productTileImage"]') || card.querySelector('div[data-testid="product-image"] img:not([alt="Subscription icon"])');
            let imgSrc = imgEl ? imgEl.src : '';

            orderItemsHtml.push(`
                <div style="display:flex; align-items:center; padding:12px 0; border-bottom:1px solid #e3e4e5; page-break-inside: avoid;">
                    <div style="width:20px; height:20px; border:2px solid #555; border-radius:4px; margin-right:15px; flex-shrink:0;"></div>
                    <div style="font-size:16px; min-width:40px; flex-shrink:0;">${qty}x</div>
                    <div style="width:50px; height:50px; margin-right:15px; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                        ${imgSrc ? `<img src="${imgSrc}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:4px;" />` : ''}
                    </div>
                    <div style="flex-grow:1; font-size:16px; color:#2e2f32; line-height:1.3;">${name}</div>
                </div>
            `);
        });

        console.log(`📦 Extracted ${orderItemNames.length} items from this order.`);

        let subWin = window.open('/subscriptions/manage', '_blank');
        if (!subWin) {
            toast.remove();
            console.error("❌ Popup blocked by browser.");
            alert("⚠️ Your browser blocked the pop-up. Please allow pop-ups for Walmart.com.");
            return;
        }

        console.log("➡️ Opened Subscriptions tab. Waiting for React to render...");

        let maxAttempts = 60;
        let attempts = 0;
        let prevCardCount = 0;
        let stableCount = 0;

        let checkInterval = setInterval(() => {
            attempts++;
            try {
                let doc = subWin.document;
                let cards = doc.querySelectorAll('.pv4');

                if (cards.length > 0) {
                    if (cards.length === prevCardCount) {
                        stableCount++;
                    } else {
                        console.log(`📈 Items loading... found ${cards.length} so far.`);
                        prevCardCount = cards.length;
                        stableCount = 0;
                    }

                    if (stableCount >= 3) {
                        clearInterval(checkInterval);
                        console.log(`✅ Success! Page stabilized with ${cards.length} subscription items.`);

                        let subs = [];
                        cards.forEach(card => {
                            let nameEl = card.querySelector('.ld_AY');
                            let name = nameEl ? nameEl.innerText.trim() : '';
                            if (!name) {
                                let imgAlt = card.querySelector('img');
                                if (imgAlt) name = imgAlt.alt;
                            }
                            if (!name) return;

                            let imgEl = card.querySelector('img');
                            let imgSrc = imgEl ? imgEl.src : '';
                            if (imgSrc) imgSrc = imgSrc.split('?')[0] + "?odnHeight=80&odnWidth=80&odnBg=FFFFFF";

                            let dateStr = '';
                            let bEls = card.querySelectorAll('b');
                            bEls.forEach(b => { if (b.parentNode && b.parentNode.innerText.includes('next delivery')) dateStr = b.innerText.trim(); });

                            if (!dateStr) {
                                let spans = card.querySelectorAll('span');
                                for (let span of spans) {
                                    if (span.innerText.includes('next delivery on')) {
                                        dateStr = span.innerText.replace('next delivery on', '').trim();
                                        break;
                                    }
                                }
                            }

                            let freqStr = '';
                            let spansFreq = card.querySelectorAll('span');
                            for (let span of spansFreq) {
                                let text = span.innerText.toLowerCase();
                                if (text.includes('every ') && !text.includes('delivery')) {
                                    freqStr = text; break;
                                }
                            }

                            if (name && dateStr) subs.push({ name, imgSrc, date: dateStr, freq: freqStr });
                        });

                        console.log(`\n📋 Raw Parsed Subscriptions from Subscriptions Page:`);
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
                                    missingItemsHtml.push(`
                                        <div style="display:flex; align-items:center; padding:12px 0; border-bottom:1px dashed #e3e4e5; page-break-inside: avoid; opacity: 0.85;">
                                            <div style="width:20px; height:20px; border:2px solid #d32f2f; border-radius:4px; margin-right:15px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:#d32f2f; font-weight:bold; font-size:14px;">!</div>
                                            <div style="font-size:16px; min-width:40px; flex-shrink:0; color:#d32f2f;">--</div>
                                            <div style="width:50px; height:50px; margin-right:15px; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                                                ${sub.imgSrc ? `<img src="${sub.imgSrc}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:4px; filter: grayscale(100%);" />` : ''}
                                            </div>
                                            <div style="flex-grow:1; font-size:16px; color:#2e2f32; line-height:1.3;">
                                                ${sub.name}
                                                <div style="font-size:12px; color:#d32f2f; margin-top:2px;">Expected on ${orderDateStr} (Based on: ${sub.freq}, next delivery ${sub.date})</div>
                                            </div>
                                        </div>
                                    `);
                                }
                            }
                        });

                        console.log(`\n%c🎯 MATHEMATICALLY EXPECTED SUBSCRIPTIONS FOR THIS ORDER (${orderDateStr}):`, 'color:#2e8b57;font-size:14px;font-weight:bold;');
                        if (expectedConsole.length > 0) {
                            console.table(expectedConsole);
                        } else {
                            console.log("%c(No items aligned mathematically with this order date)", "color:#777; font-style:italic;");
                        }

                        toast.remove();

                        let now = new Date();
                        let dateStr = now.toLocaleDateString();
                        let timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                        let missingSection = missingItemsHtml.length > 0
                            ? `<h2 style="margin: 30px 0 10px 0; font-size:20px; color:#d32f2f; border-bottom: 2px solid #d32f2f; padding-bottom:5px;">⚠️ Missing / Expected Subscriptions</h2>
                               <div style="background-color: #fff8f8; padding: 10px; border-radius: 4px; border: 1px solid #ffebee; margin-bottom: 15px; font-size: 13px; color: #b71c1c;">
                                 <strong>Note:</strong> Missing items are calculated retroactively based on your <em>current</em> subscription schedules. If this is a past order, this list may be inaccurate due to manual skips or frequency changes.
                               </div>
                               ${missingItemsHtml.join('')}`
                            : `<h2 style="margin: 30px 0 10px 0; font-size:20px; color:#2e8b57; border-bottom: 2px solid #2e8b57; padding-bottom:5px;">✓ All Expected Subscriptions Accounted For</h2>`;

                        subWin.document.open();
                        subWin.document.write(`
                            <html>
                            <head>
                                <title>Walmart Delivery Audit ${dateStr}</title>
                                <style>@media print { body { padding: 0 !important; margin: 0 !important; } }</style>
                            </head>
                            <body style="background-color:#fff; padding:30px; margin:0; font-family:'Bogle', 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#2e2f32;">
                                <div style="max-width:850px; margin:0 auto;">
                                    <div style="border-bottom:3px solid #0071ce; padding-bottom:15px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-end;">
                                        <div>
                                            <h1 style="margin:0 0 8px 0; font-size:26px; font-weight:700; color:#0071ce;">Delivery Checklist & Audit</h1>
                                            <div style="font-size:14px; color:#555;">
                                                <strong>${orderNum || 'Walmart Order'}</strong> &nbsp;|&nbsp; ${deliveryStatus} &nbsp;|&nbsp; <strong>${orderItemNames.length} Items Delivered</strong>
                                                <br><span style="color:#777; font-size:12px; margin-top:4px; display:inline-block;">Generated: ${dateStr} ${timeStr}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <h2 style="margin: 0 0 10px 0; font-size:20px; color:#2e2f32;">Delivered Items</h2>
                                    <div>${orderItemsHtml.join('')}</div>
                                    ${missingSection}
                                </div>
                                <script>setTimeout(() => window.print(), 1500);</script>
                            </body>
                            </html>
                        `);
                        subWin.document.close();

                    }
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    subWin.close();
                    toast.remove();
                    console.error("❌ Timeout waiting for subscriptions to load.");
                    alert("Timeout waiting for subscriptions to load.");
                }
            } catch (e) {
                // Ignore temporary cross-origin exceptions while the tab redirects
            }
        }, 500);
    }
})();