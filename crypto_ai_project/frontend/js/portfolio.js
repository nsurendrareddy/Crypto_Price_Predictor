// portfolio.js
function addCoinToPortfolio(coinId, quantity) {
    fetch(`/api/predict?coin=${coinId}`)
        .then(res => res.json())
        .then(data => {
            const currentPrice = data.history[data.history.length-1].price;
            const pred3m = data.predictions["3m"][data.predictions["3m"].length-1].predicted;
            const pred6m = data.predictions["6m"][data.predictions["6m"].length-1].predicted;
            const pred1y = data.predictions["1y"][data.predictions["1y"].length-1].predicted;

            const table = document.getElementById("portfolio-table");
            const row = table.insertRow();
            row.innerHTML = `
                <td>${coinId.toUpperCase()}</td>
                <td>${quantity}</td>
                <td>$${currentPrice.toFixed(2)}</td>
                <td>$${pred3m.toFixed(2)}</td>
                <td>$${pred6m.toFixed(2)}</td>
                <td>$${pred1y.toFixed(2)}</td>
                <td><button onclick="removeRow(this)">❌</button></td>
            `;
        });
}

// Remove coin from portfolio
function removeRow(btn) {
    if(confirm("Are you sure you want to remove this coin?")) {
        const row = btn.parentNode.parentNode;
        row.parentNode.removeChild(row);
    }
}
