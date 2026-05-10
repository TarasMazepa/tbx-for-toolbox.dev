(function() {
    let items = [];
    let cards = document.querySelectorAll('.pv4');

    cards.forEach(card => {
        let nameEl = card.querySelector('.ld_AY');
        let name = nameEl ? nameEl.innerText.trim() : '';

        if(!name) {
            let imgAlt = card.querySelector('img');
            if(imgAlt) name = imgAlt.alt;
        }
        if(!name) return;

        // --- THE IMAGE FIX ---
        let imgEl = card.querySelector('img');
        let imgSrc = imgEl ? imgEl.src : '';
        if (imgSrc) {
            // Strip off any existing parameters and force a tiny 80x80 thumbnail request
            imgSrc = imgSrc.split('?')[0] + "?odnHeight=80&odnWidth=80&odnBg=FFFFFF";
        }

        // Extract base date
        let dateStr = '';
        let bEls = card.querySelectorAll('b');
        bEls.forEach(b => {
            if(b.parentNode && b.parentNode.innerText.includes('next delivery')) {
                dateStr = b.innerText.trim();
            }
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

        // Extract frequency
        let freqStr = '';
        let spansFreq = card.querySelectorAll('span');
        for(let span of spansFreq) {
            let text = span.innerText.toLowerCase();
            if(text.includes('every ') && !text.includes('delivery')) {
                freqStr = text;
                break;
            }
        }

        if(name && dateStr) items.push({name, imgSrc, date: dateStr, freq: freqStr});
    });

    if(items.length === 0) {
        alert("No subscription items found.");
        return;
    }

    const currentYear = new Date().getFullYear();
    let today = new Date();
    today.setHours(0,0,0,0);

    // Pre-calculate all dates for each item (backwards and forwards) BEFORE sorting
    items.forEach(item => {
        console.groupCollapsed('T:'+item.name);
        console.log("F:", item.freq);

        item.dateObj = new Date(`${item.date} ${currentYear}`);
        console.log("Base DateObj:", item.dateObj.toString());
        item.allDates = [];

        let match = item.freq.match(/every\s+(\d+)?\s*(week|month)s?/i);
        item.freqDays = 9999;

        if (match) {
            let amount = parseInt(match[1]) || 1;
            let unit = match[2].toLowerCase();
            console.log("A:", amount, "U:", unit);
            item.freqDays = (unit === 'week') ? amount * 7 : amount * 30;

            // Backwards extrapolation
            let backDate = new Date(item.dateObj.getTime());
            for(let i = 0; i < 20; i++) {
                console.log(`[B${i}]`, backDate);
                if (unit === 'week') {
                    backDate.setDate(backDate.getDate() - (amount * 7));
                } else if (unit === 'month') {
                    backDate.setMonth(backDate.getMonth() - amount);
                }


                if (backDate >= today) {
                    let m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][backDate.getMonth()];
                    let d = backDate.getDate().toString().padStart(2, '0');
                    let y = backDate.getFullYear();
                    item.allDates.unshift(`${m} ${d} ${y}`);
                } else {
                    break;
                }
            }
        }

        // Base date
        let mBase = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][item.dateObj.getMonth()];
        let dBase = item.dateObj.getDate().toString().padStart(2, '0');
        let yBase = item.dateObj.getFullYear();
        item.allDates.push(`${mBase} ${dBase} ${yBase}`);

        // Forwards extrapolation
        if (match) {
            let amount = parseInt(match[1]) || 1;
            let unit = match[2].toLowerCase();
            let fwdDate = new Date(item.dateObj.getTime());

            for(let i = 0; i < 10; i++) {
                console.log(`[F${i}]`, fwdDate);
                if (unit === 'week') {
                    fwdDate.setDate(fwdDate.getDate() + (amount * 7));
                } else if (unit === 'month') {
                    fwdDate.setMonth(fwdDate.getMonth() + amount);
                }


                let m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][fwdDate.getMonth()];
                let d = fwdDate.getDate().toString().padStart(2, '0');
                let y = fwdDate.getFullYear();
                item.allDates.push(`${m} ${d} ${y}`);
            }
        }

        console.log("Final allDates Array:", item.allDates);
        console.groupEnd();
    });

    // Calculate earliest actual upcoming date for sorting
    items.forEach(item => {
        let validFutureDates = item.allDates
            .map(d => new Date(d).getTime())
            .filter(t => t >= today.getTime());

        if (validFutureDates.length > 0) {
            item.earliestFutureTime = Math.min(...validFutureDates);
        } else {
            item.earliestFutureTime = item.dateObj.getTime();
        }
    });

    // Sort items (Soonest Date -> Smallest Frequency -> Alphabetical)
    items.sort((a, b) => {
        if (a.earliestFutureTime !== b.earliestFutureTime) return a.earliestFutureTime - b.earliestFutureTime;
        if (a.freqDays !== b.freqDays) return a.freqDays - b.freqDays;
        return a.name.localeCompare(b.name);
    });

    // Determine the column headers
    let allExtrapolatedDates = items.flatMap(i => i.allDates);
    let uniqueDates = [...new Set(allExtrapolatedDates)];
    uniqueDates.sort((a, b) => new Date(a) - new Date(b));

    // Filter out past dates for the columns
    uniqueDates = uniqueDates.filter(d => new Date(d) >= today);

    let maxCols = 5;
    let colDates = uniqueDates.slice(0, maxCols);
    let maxDateObj = new Date(colDates[colDates.length - 1]);

    // Calculate Later Dates
    items.forEach(item => {
        item.nextAfterMax = '';
        for (let d of item.allDates) {
            if (new Date(d) > maxDateObj) {
                item.nextAfterMax = d;
                break;
            }
        }
    });

    // Build the grid
    let html = `<html><head><title>Walmart Subscription Calendar</title><style>body{font-family:'Bogle','Helvetica Neue',Helvetica,Arial,sans-serif;padding:20px;color:#2e2f32;max-width:1000px;margin:0 auto}h1{color:#0071ce;margin-bottom:15px;font-size:24px;border-bottom:2px solid #0071ce;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed}th,td{border:1px solid #e3e4e5;padding:4px 6px;text-align:center;font-size:13px;overflow:hidden}th{background:#f4f5f7;font-weight:600;padding:6px}td.item-name{text-align:left;display:flex;align-items:center;gap:10px;border-bottom:none;border-top:none}tr{border-bottom:1px solid #e3e4e5;page-break-inside:avoid}img{width:36px;height:36px;object-fit:contain;border-radius:4px;background:#fff;flex-shrink:0}.item-name-text{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;line-height:1.2}.check{color:#0071ce;font-weight:bold;font-size:1.3em;line-height:1}.freq-subtext{font-size:11px;color:#777;display:block;margin-top:2px}@media print{body{padding:0;max-width:100%}@page{margin:.4in;size:portrait}}</style></head><body><h1>Subscription Calendar</h1><table><thead><tr><th style="text-align:left;width:50%">Item</th>`;

    colDates.forEach(d => { let displayDate = d.split(' ').slice(0, 2).join(' '); html += `<th style="width: 8%;">${displayDate}</th>`; });

    html += `<th style="width:10%">Later Dates</th></tr></thead><tbody>`;

    items.forEach(item => {
      html += `<tr><td class="item-name">`;
      if(item.imgSrc) html += `<img loading="lazy" src="${item.imgSrc}">`;
      let freqDisplay = item.freq ? `<span class="freq-subtext">${item.freq}</span>` : '';
      html += `<div><span class="item-name-text">${item.name}</span>${freqDisplay}</div></td>`;

      colDates.forEach(d => {
        if(item.allDates.includes(d)) {
          html += `<td><span class="check">✓</span></td>`;
        } else {
          html += `<td></td>`;
        }
      });

      if(item.nextAfterMax) {
        html += `<td style="color: #555; font-weight: 500;">${item.nextAfterMax.split(' ').slice(0, 2).join(' ')}</td>`;
      } else {
        html += `<td></td>`;
      }
      html += `</tr>`;
    });

    html += `</tbody></table><script>window.onload=function(){setTimeout(()=>window.print(),500)};</script></body></html>`;

    let win = window.open('', '_blank');
    if(win) {
        win.document.write(html);
        win.document.close();
    } else {
        alert("⚠️ Browser blocked pop-up.");
    }
})();
