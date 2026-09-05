(function(){
    /* 1. Extract Items */
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
            <div style="display:flex; align-items:center; padding:8px 0; border-bottom:1px solid #e3e4e5; page-break-inside: avoid;">
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
            win.document.write(`<html><head><title>Walmart Delivery Checklist 2-Col</title><style>@media print{body{padding:0!important;margin:0!important}}</style></head><body style="background-color:#fff;padding:10px;margin:0;font-family:'Bogle', 'Helvetica Neue', Helvetica, Arial, sans-serif;color:#2e2f32;"><div style="max-width:850px;margin:0 auto;"><div style="display:grid;grid-template-columns:1fr 1fr;gap:0 40px;">${items.join('')}</div></div><script>setTimeout(()=>window.print(),1500);</script></body></html>`);
            win.document.close();
        } else {
            alert("⚠️ Your browser blocked the pop-up. Please allow pop-ups for Walmart.com to generate the PDF.");
        }
    } else {
        alert("No items found. Make sure the order details are fully loaded.");
    }
})();
