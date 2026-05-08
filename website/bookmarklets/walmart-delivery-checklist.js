(function(){
    /* 1. Extract Order Meta Info */
    let orderNum = '';
    let spans = document.querySelectorAll('span');
    for (let span of spans) {
        if (span.innerText.includes('Order#')) {
            orderNum = span.innerText.trim();
            break;
        }
    }

    let deliveryStatus = '';
    let h2s = document.querySelectorAll('h2');
    for (let h2 of h2s) {
        if (h2.innerText.includes('Delivered') || h2.innerText.includes('Arriving') || h2.innerText.includes('Delivery')) {
            deliveryStatus = h2.innerText.trim();
            break;
        }
    }

    /* 2. Extract Items */
    let itemCards = document.querySelectorAll('div[data-testid="itemtile-stack"]');
    let items = [];

    itemCards.forEach(card => {
        let nameEl = card.querySelector('div[data-testid="productName"]');
        if(!nameEl) return;
        let name = nameEl.innerText.trim();

        let qtyEl = card.querySelector('.bill-item-quantity');
        let qty = qtyEl ? qtyEl.innerText.trim().replace(/Qty\s*/i, '') : '1';

        let imgEl = card.querySelector('img[data-testid="productTileImage"]') || card.querySelector('div[data-testid="product-image"] img:not([alt="Subscription icon"])');
        let imgSrc = imgEl ? imgEl.src : '';

        /* Build compact, print-friendly item row with NORMAL font weight */
        items.push(`
            <div style="display:flex; align-items:center; padding:12px 0; border-bottom:1px solid #e3e4e5; page-break-inside: avoid;">
                <div style="width:20px; height:20px; border:2px solid #555; border-radius:4px; margin-right:15px; flex-shrink:0;"></div>
                <div style="font-size:16px; min-width:40px; flex-shrink:0;">${qty}x</div>
                <div style="width:50px; height:50px; margin-right:15px; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                    ${imgSrc ? `<img src="${imgSrc}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:4px;" />` : ''}
                </div>
                <div style="flex-grow:1; font-size:16px; color:#2e2f32; line-height:1.3;">
                    ${name}
                </div>
            </div>
        `);
    });

    /* 3. Generate Page */
    if(items.length > 0) {
        let win = window.open('', '_blank');
        if(win) {
            let now = new Date();
            let dateStr = now.toLocaleDateString();
            let timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            win.document.write(`
                <html>
                <head>
                    <title>Walmart Delivery Checklist ${dateStr}</title>
                    <style>
                        /* Print-specific overrides to maximize paper space */
                        @media print {
                            body { padding: 0 !important; margin: 0 !important; }
                        }
                    </style>
                </head>
                <body style="background-color:#fff; padding:30px; margin:0; font-family:'Bogle', 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#2e2f32;">
                    <div style="max-width:850px; margin:0 auto;">

                        <div style="border-bottom:3px solid #0071ce; padding-bottom:15px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-end;">
                            <div>
                                <h1 style="margin:0 0 8px 0; font-size:26px; font-weight:700; color:#0071ce;">Delivery Checklist</h1>
                                <div style="font-size:14px; color:#555;">
                                    <strong>${orderNum || 'Walmart Order'}</strong> &nbsp;|&nbsp; ${deliveryStatus} &nbsp;|&nbsp; <strong>${items.length} Items</strong>
                                    <br><span style="color:#777; font-size:12px; margin-top:4px; display:inline-block;">Generated: ${dateStr} ${timeStr}</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            ${items.join('')}
                        </div>
                    </div>

                    <script>
                        /* Wait 1.5 seconds for all images to fetch before opening Print dialog */
                        setTimeout(() => window.print(), 1500);
                    </script>
                </body>
                </html>
            `);
            win.document.close();
        } else {
            alert("⚠️ Your browser blocked the pop-up. Please allow pop-ups for Walmart.com to generate the PDF.");
        }
    } else {
        alert("No items found. Make sure the order details are fully loaded.");
    }
})();
