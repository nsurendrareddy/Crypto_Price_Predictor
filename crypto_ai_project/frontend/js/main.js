// main.js
document.addEventListener("DOMContentLoaded", function () {
    const themeToggle = document.getElementById("theme-toggle");
    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");
    });

    // Fetch and render all coins on home page
    fetch("/api/coins")
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById("coin-container");
            data.forEach(coin => {
                const div = document.createElement("div");
                div.classList.add("coin");
                div.innerHTML = `
                    <img src="${coin.image}" alt="${coin.name}" />
                    <div class="coin-info">
                        <p>${coin.symbol}</p>
                        <p>$${coin.current_price.toFixed(2)}</p>
                    </div>`;
                
                // Add flip + modal event
                div.addEventListener("click", () => openCoinModal(coin.id));
                container.appendChild(div);
            });
        });
});

// Function to open coin modal
function openCoinModal(coinId) {
    // Flip effect
    const modal = document.getElementById("coin-modal");
    modal.classList.add("flip");
    
    // Fetch history + predictions
    fetch(`/api/predict?coin=${coinId}`)
        .then(res => res.json())
        .then(data => {
            renderChart(data.history, data.predictions);
            renderCoinInfo(coinId);
        });
    
    modal.style.display = "block";
}

// Close modal
document.getElementById("close-modal").addEventListener("click", () => {
    const modal = document.getElementById("coin-modal");
    modal.style.display = "none";
    modal.classList.remove("flip");
});
