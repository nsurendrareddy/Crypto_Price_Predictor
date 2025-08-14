// charts.js
function renderChart(history, predictions) {
    const ctx = document.getElementById("coin-chart").getContext("2d");
    const labels = history.map(h => h.date);
    const prices = history.map(h => h.price);

    const pred3m = predictions["3m"].map(p => p.predicted);
    const pred6m = predictions["6m"].map(p => p.predicted);
    const pred1y = predictions["1y"].map(p => p.predicted);

    const predLabels = [
        ...predictions["3m"].map(p => p.date),
        ...predictions["6m"].map(p => p.date),
        ...predictions["1y"].map(p => p.date)
    ];

    new Chart(ctx, {
        type: "line",
        data: {
            labels: labels.concat(predLabels),
            datasets: [
                {
                    label: "History",
                    data: prices,
                    borderColor: "blue",
                    fill: false
                },
                {
                    label: "3M Prediction",
                    data: Array(prices.length).fill(null).concat(pred3m),
                    borderColor: "green",
                    borderDash: [5,5],
                    fill: false
                },
                {
                    label: "6M Prediction",
                    data: Array(prices.length+pred3m.length).fill(null).concat(pred6m),
                    borderColor: "orange",
                    borderDash: [5,5],
                    fill: false
                },
                {
                    label: "1Y Prediction",
                    data: Array(prices.length+pred3m.length+pred6m.length).fill(null).concat(pred1y),
                    borderColor: "red",
                    borderDash: [5,5],
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: "top" } }
        }
    });
}

// Render coin description
function renderCoinInfo(coinId) {
    fetch(`/api/coin_details?coin=${coinId}`)
        .then(res => res.json())
        .then(data => {
            document.getElementById("coin-description").innerHTML = `
                <h3>${data.name} (${data.symbol})</h3>
                <p>Rank: ${data.market_cap_rank}</p>
                <p>${data.description}</p>
            `;
        });
}
