let db;

// Open IndexedDB
function openDatabase() {
    let openRequest = indexedDB.open("PeriodTracker", 1);

    openRequest.onupgradeneeded = function (e) {
        let db = e.target.result;
        if (!db.objectStoreNames.contains('trackingData')) {
            db.createObjectStore('trackingData', { keyPath: 'id', autoIncrement: true });
        }
    };

    openRequest.onsuccess = function (e) {
        db = e.target.result;
        initializeNavigationLinks();
        if (document.getElementById("trackPage").style.display === 'block') {
            checkStatusAndAsk();
        }
    };

    openRequest.onerror = function (e) {
        console.error('Error opening database');
    };
}

function checkStatusAndAsk() {
    let transaction = db.transaction(["trackingData"], "readonly");
    let store = transaction.objectStore("trackingData");
    let getLastItem = store.openCursor(null, 'prev');

    getLastItem.onsuccess = function (e) {
        let cursor = e.target.result;

        if (cursor) {
            let lastData = cursor.value;
            if (!lastData.pmsStarted) {
                displaySection('askPMS');
            } else if (!lastData.bleedingStarted) {
                displaySection('askBleeding');
            } else if (!lastData.flowAmount) {
                displaySection('askFlowAmount');
            } else {
                displaySection('askFlowStopped');
            }
        } else {
            displaySection('askPMS');
        }
    };
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let sessionPassword = null; // This will hold the password temporarily

async function checkForPassword() {
    // This should be called when the app starts
    const storedHash = localStorage.getItem('passwordHash');
    if (!storedHash) {
        // Prompt user for a new password if none is stored
        const newPassword = prompt('Please set up a new password:');
        if (newPassword) {
            hashPassword(newPassword).then(hash => {
                localStorage.setItem('passwordHash', hash);
                sessionPassword = newPassword; // Temporarily store password in session
                alert('Password has been set up successfully.');
            });
        }
    } else {
        // Ask for the password and check it against the stored hash
        const inputPassword = prompt('Please enter your password to continue:');
        hashPassword(inputPassword).then(inputHash => {
            if (inputHash === storedHash) {
                sessionPassword = inputPassword; // Temporarily store password in session
                alert('Password is correct, access granted.');
            } else {
                alert('Incorrect password.');
                checkForPassword(); // Call recursively until the correct password is entered
            }
        });
    }
}

function saveData(data, nextSection) {
    if (!sessionPassword) {
        console.error("No session password available. Cannot encrypt data.");
        return;
    }
    try {
        const encryptedData = encryptData(data, sessionPassword);
        let transaction = db.transaction(["trackingData"], "readwrite");
        let store = transaction.objectStore("trackingData");
        let addRequest = store.add({ id: data.id, encryptedData: encryptedData });

        addRequest.onsuccess = function () {
            displaySection(nextSection);
        };

        addRequest.onerror = function (e) {
            console.error('Error saving data: ', e.target.error);
        };
    } catch (error) {
        console.error('Error encrypting or saving data:', error);
    }
}

function encryptData(data, password) {
    var ciphertext = CryptoJS.AES.encrypt(JSON.stringify(data), password).toString();
    return ciphertext;
}

function decryptData(ciphertext, password) {
    var bytes = CryptoJS.AES.decrypt(ciphertext, password);
    var decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    return decryptedData;
}

function displaySection(sectionId) {
    let sections = ['askPMS', 'askBleeding', 'askFlowAmount', 'askFlowStopped'];
    sections.forEach(id => {
        const element = document.getElementById(id);
        if (id === sectionId) {
            element.classList.remove('invisible');
            element.classList.add('visible');
        } else {
            element.classList.remove('visible');
            element.classList.add('invisible');
        }
    });
    resizeCards();
}

function initializeNavigationLinks() {
    const header = document.getElementById("Title");
    document.querySelectorAll("nav a").forEach((link) => {
        link.addEventListener("click", function (e) {
            const title = e.currentTarget.getAttribute("data-title");
            header.textContent = title;

            document.querySelectorAll(".page, #defaultContent").forEach((div) => {
                div.classList.add('invisible');
            });

            switch (title) {
                case "Track Page":
                    const trackPage = document.getElementById("trackPage");
                    trackPage.classList.remove('invisible');
                    trackPage.classList.add('visible');
                    checkStatusAndAsk();
                    break;
                case "Predict Page":
                    const predictPage = document.getElementById("predictPage");
                    predictPage.classList.remove('invisible');
                    predictPage.classList.add('visible');
                    calculatePredictions()
                    break;
                case "Settings Page":
                    const settingsPage = document.getElementById("settingsPage");
                    settingsPage.classList.remove('invisible');
                    settingsPage.classList.add('visible');
                    break;
                case "History Page":
                    const historyPage = document.getElementById("historyPage");
                    historyPage.classList.remove('invisible');
                    historyPage.classList.add('visible');
                    displayHistory();
                    break;
            }
        });
    });
}


// Handle PMS Started
function handlePMSStarted(status) {
    if (status) {
        let data = {
            id: Date.now(),
            pmsStarted: status,
            pmsStartDate: new Date(),
            flowData: []
        };
        saveData(data, 'askBleeding');
    }
}

// Handle Bleeding Started
function handleBleedingStarted(status) {
    if (status) {
        let data = {
            id: Date.now(),
            bleedingStarted: status,
            bleedingStartDate: new Date().toISOString()
        };
        saveData(data, 'askFlowAmount');
    }
}

// Handle Flow Amount
function handleFlowAmount() {
    let flow = document.getElementById('flowAmount').value;
    if (flow) {
        let data = {
            id: Date.now(),
            flowAmount: flow,
            flowDate: new Date().toISOString() // Capture the date when the flow amount was recorded
        };
        saveData(data, 'askFlowStopped');
    }
}

// Handle Flow Stopped
function handleFlowStopped(status) {
    if (status) {
        let data = {
            id: Date.now(),
            periodEnded: status,
            periodEndedDate: new Date().toISOString()
        };
        saveData(data, 'askPMS')
    }
}

window.onload = function () {
    document.getElementById("trackPage").style.display = 'none';
    openDatabase();
    checkForPassword();
}

function groupDataByPeriod(periods) {
    let groupedData = [];
    let currentPeriod = null;

    periods.forEach(data => {
        // If we have a PMS start and no active period, start a new period
        if (data.pmsStarted && !currentPeriod) {
            currentPeriod = {
                pmsStartDate: data.pmsStartDate,
                days: [],
                flowAmounts: [], // Initialize an array to accumulate flow amounts
                flowDates: [],    // Initialize an array to accumulate flow dates
                periodEndDate: data.periodEndedDate
            };
        }

        // If we have an active period and bleeding data, add it to the period
        if (currentPeriod && data.bleedingStarted) {
            currentPeriod.bleedingStartDate = data.bleedingStartDate;
        }

        // If we have an active period and flow data, accumulate it
        if (currentPeriod && data.flowAmount) {
            currentPeriod.flowAmounts.push(data.flowAmount);
            currentPeriod.flowDates.push(data.flowDate);
        }

        // If we have an active period and it's the end, close off the period
        if (currentPeriod && data.periodEnded) {
            currentPeriod.periodEnd = data.periodEnded;
            currentPeriod.periodEndDate = data.periodEndedDate;
            groupedData.push(currentPeriod);
            currentPeriod = null;
        }
    });

    // If we have an active period that hasn't ended, add it to the list
    if (currentPeriod) {
        groupedData.push(currentPeriod);
    }

    return groupedData;
}

function displayHistory() {
    let transaction = db.transaction(["trackingData"], "readonly");
    let store = transaction.objectStore("trackingData");
    let getAllDataRequest = store.getAll();

    getAllDataRequest.onsuccess = function (e) {
        let encryptedHistory = e.target.result;
        let decryptedHistory = encryptedHistory.map(entry => decryptData(entry.encryptedData, sessionPassword));
        let groupedPeriods = groupDataByPeriod(decryptedHistory); // Use the function you already have to group data

        // Now process each grouped period
        let historyHTML = groupedPeriods.map(period => {
            let pmsStartDate = period.pmsStartDate ? new Date(period.pmsStartDate).toLocaleDateString() : 'N/A';
            let bleedingStartDate = period.bleedingStartDate ? new Date(period.bleedingStartDate).toLocaleDateString() : 'N/A';
            let periodEndedDate = period.periodEndDate ? new Date(period.periodEndDate).toLocaleDateString() : 'N/A';

            // Create flow details
            let flowDetails = period.flowAmounts.map((flow, index) => {
                let flowDate = new Date(period.flowDates[index]).toLocaleDateString();
                return `Flow: ${flowDate} ${flow}`;
            }).join('<br>');

            return `
                <div class="period-entry card" id="historyCard" onclick="toggleDetails(this)" data-date="${bleedingStartDate}">
                    <div class="period-summary">
                        Period from ${bleedingStartDate} to ${periodEndedDate} <span class="toggle-icon"></span>
                    </div>
                    <div class="period-entry-details">
                        PMS Start Date: ${pmsStartDate}<br>
                        Period Start Date: ${bleedingStartDate}<br>
                        ${flowDetails}<br>
                        Period End Date: ${periodEndedDate}
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById("historyContent").innerHTML = historyHTML;
    };

    getAllDataRequest.onerror = function (e) {
        console.error('Error fetching data from IndexedDB: ', e.target.error);
    };
}

// Function to toggle period details
function toggleDetails(element) {
    let details = element.firstElementChild.nextElementSibling;
    let icon = element.querySelector('.toggle-icon');  // Assumes icon is a child of the period entry

    if (details.classList.contains('period-entry-details-expanded')) {
        details.classList.remove('period-entry-details-expanded');
        icon.style.transform = 'rotate(0deg)';
    } else {
        details.classList.add('period-entry-details-expanded');
        icon.style.transform = 'rotate(180deg)';
    }
}

function clearHistory() {
    if (!confirm("Are you sure you want to clear all period history? This action cannot be undone.")) {
        return;
    }

    let transaction = db.transaction(["trackingData"], "readwrite");
    let store = transaction.objectStore("trackingData");
    let clearRequest = store.clear();

    clearRequest.onsuccess = function () {
        alert("Period history cleared successfully.");
        displayHistory(); // Refresh the history display
    };

    clearRequest.onerror = function (e) {
        console.error('Error clearing data: ', e.target.error);
        alert("Error clearing period history.");
    };
}

function toggleTrackingOption(optionId) {
    const isChecked = document.getElementById(optionId).checked;
    let cardId = "";

    switch (optionId) {
        case "trackEmotions":
            cardId = "emotionsCard";
            break;
        case "trackBowlMovements":
            cardId = "bowlMovementsCard";
            break;
        case "trackAppetite":
            cardId = "appetiteCard";
            break;
    }

    const card = document.getElementById(cardId);
    if (isChecked) {
        card.classList.remove("invisible");
        card.classList.add("visible");
    } else {
        card.classList.add("invisible");
        card.classList.remove("visible");
    }
    resizeCards();
}

function resizeCards() {
    const cards = document.querySelectorAll('.card:not(.invisible)'); // select all visible cards
    const numberOfCards = cards.length;

    cards.forEach((card, index) => {
        // Decrease the size of the card for each additional card that's visible
        const scaleValue = 1 - (0.05 * (numberOfCards - 1));
        card.style.transform = `scale(${scaleValue})`;

        // Adjust the margin between the cards
        const adjustedMargin = 8 * (scaleValue * scaleValue * scaleValue); // further reduce the margin based on the scale
        card.style.marginBottom = `${adjustedMargin}px`;
        card.style.marginTop = '0px';
    });
}

function handlePastDataInput() {
    const pmsStartDate = document.getElementById('pastPMSStartDate').value;
    const bleedingStartDate = document.getElementById('pastBleedingStartDate').value;
    const flowAmount = document.getElementById('pastFlowAmount').value;
    const periodEndDate = document.getElementById('pastPeriodEndDate').value;

    if (!pmsStartDate || !bleedingStartDate || !flowAmount || !periodEndDate) {
        alert('Please fill in all the fields.');
        return;
    }

    const data = {
        pmsStarted: true,
        pmsStartDate: new Date(pmsStartDate).toISOString(),
        bleedingStarted: true,
        bleedingStartDate: new Date(bleedingStartDate).toISOString(),
        flowAmount: flowAmount,
        periodEnded: new Date(periodEndDate).toISOString()
    };

    saveData(data, null); // No need to navigate to the next section after saving past data
    alert('Past period data saved successfully.');
}

function toggleSort() {
    var icon = document.querySelector('.sort-icon');
    if (icon.classList.contains('sort-icon-flipped')) {
        icon.classList.remove('sort-icon-flipped');
        handleSort('date-desc');
    } else {
        icon.classList.add('sort-icon-flipped');
        handleSort('date-asc');
    }
}

function handleSort(sortCriteria) {
    var entries = Array.from(document.querySelectorAll('.period-entry'));

    entries.sort(function (a, b) {
        switch (sortCriteria) {
            case 'date-asc':
                return new Date(a.getAttribute('data-date')) - new Date(b.getAttribute('data-date'));
            case 'date-desc':
                return new Date(b.getAttribute('data-date')) - new Date(a.getAttribute('data-date'));
            default:
                return 0;  // No sorting
        }
    });

    var historyContent = document.getElementById('historyContent');
    entries.forEach(function (entry) {
        historyContent.appendChild(entry);  // Re-append entries in sorted order
    });
}


function handleSearch() {
    var query = document.getElementById('searchInput').value.toLowerCase();
    var entries = document.querySelectorAll('.period-entry');
    entries.forEach(function (entry) {
        var entryText = entry.textContent || entry.innerText;
        entry.style.display = entryText.toLowerCase().indexOf(query) > -1 ? '' : 'none';
    });
}

function calculatePredictions() {
    // Fetch the data from IndexedDB
    let transaction = db.transaction(["trackingData"], "readonly");
    let store = transaction.objectStore("trackingData");
    let getAllDataRequest = store.getAll();

    getAllDataRequest.onsuccess = function (e) {
        let encryptedHistory = e.target.result;
        let decryptedHistory = encryptedHistory.map(entry => decryptData(entry.encryptedData, sessionPassword));
        let groupedPeriods = groupDataByPeriod(decryptedHistory);

        // Constants for standard cycle length and period duration
        const STANDARD_CYCLE_LENGTH = 28;  // average cycle length in days
        const STANDARD_PERIOD_DURATION = 5;  // average period duration in days

        // Calculate predictions
        let predictedCycleLength = STANDARD_CYCLE_LENGTH;
        let averagePeriodDuration = STANDARD_PERIOD_DURATION;
        let lastPeriodStartDate;
        let predictedPeriodStartDate;
        let predictedPeriodEndDate;

        // Check if at least one period is recorded to use actual data
        if (groupedPeriods.length > 1) {

            // Thresholds to determine the significance of the data
            const significantDataThreshold = 12;  // e.g., 12 periods for one year of data
            const seasonalDataThreshold = 36;  // e.g., 3 years of data to start considering seasonality

            // Variables to hold sum and count for calculating averages
            let totalCycleLength = 0;
            let totalPeriodDuration = 0;
            let count = 0;

            // Variables to hold seasonal data
            let seasonalCycleLengths = Array(12).fill(0);
            let seasonalCycleCounts = Array(12).fill(0);

            for (let i = 1; i < groupedPeriods.length; i++) {  // start at 1 to avoid index out of bounds
                let previousPeriodStartDate = new Date(groupedPeriods[i - 1].bleedingStartDate);
                let currentPeriodStartDate = new Date(groupedPeriods[i].bleedingStartDate);
                let currentPeriodEndDate = new Date(groupedPeriods[i].periodEndedDate);

                // Calculate the difference in days between the start of the current period and the start of the previous period
                let cycleLength = Math.abs((currentPeriodStartDate - previousPeriodStartDate) / (1000 * 60 * 60 * 24));
                totalCycleLength += cycleLength;


                // Calculate the duration of the current period in days
                let periodDuration = (currentPeriodEndDate - currentPeriodStartDate) / (1000 * 60 * 60 * 24);
                totalPeriodDuration += periodDuration;

                // If there's enough data to consider seasonality, collect seasonal data
                if (groupedPeriods.length >= seasonalDataThreshold) {
                    let month = currentPeriodStartDate.getMonth();  // getMonth() returns 0-11
                    seasonalCycleLengths[month] += cycleLength;
                    seasonalCycleCounts[month] += 1;
                }
                count++;
            }

            // Calculate averages
            let averageCycleLength = totalCycleLength / count;
            let averagePeriodDuration = totalPeriodDuration / count;

            // Determine which averages to use for prediction
            let predictedCycleLength = averageCycleLength;  // default to overall average

            // If there's enough data to consider seasonality, use seasonal averages
            if (groupedPeriods.length >= seasonalDataThreshold) {
                lastPeriodStartDate = new Date(groupedPeriods[groupedPeriods.length - 1].bleedingStartDate);
                let month = lastPeriodStartDate.getMonth();
                if (seasonalCycleCounts[month] > 0) {  // avoid division by zero
                    predictedCycleLength = seasonalCycleLengths[month] / seasonalCycleCounts[month];
                }
            } else if (groupedPeriods.length >= significantDataThreshold) {
                // If there's significant data but not enough for seasonality, use user data average
                predictedCycleLength = averageCycleLength;
            }

        } else if (groupedPeriods.length === 1) {
            // Use the data from the one period, if available, to adjust the standard duration if possible
            let onlyPeriod = groupedPeriods[0];
            let periodStartDate = new Date(onlyPeriod.bleedingStartDate);
            let periodEndDate = new Date(onlyPeriod.periodEndDate);
            averagePeriodDuration = (periodEndDate - periodStartDate) / (1000 * 60 * 60 * 24);
        }

        // Calculate the predicted start and end dates using the predicted cycle length and period duration
        if (groupedPeriods.length > 0) {
            lastPeriodStartDate = new Date(groupedPeriods[groupedPeriods.length - 1].bleedingStartDate);
        } else {
            // If there are no periods recorded, use today's date as a placeholder
            lastPeriodStartDate = new Date();
        }

        predictedPeriodStartDate = new Date(lastPeriodStartDate.getTime() + predictedCycleLength * (1000 * 60 * 60 * 24));
        predictedPeriodEndDate = new Date(predictedPeriodStartDate.getTime() + averagePeriodDuration * (1000 * 60 * 60 * 24));

        // Update the Predict page with the calculated predictions
        document.getElementById("predictedPMSStartDate").textContent = predictedPeriodStartDate.toLocaleDateString();
        document.getElementById("predictedPeriodStartDate").textContent = predictedPeriodStartDate.toLocaleDateString();
        document.getElementById("predictedFlow").textContent = "Average Flow";  // Adjusted to reflect fallback to standard values

        // Get today's date
        let today = new Date();

        // Identify the most recent period recorded
        let mostRecentPeriod = groupedPeriods[groupedPeriods.length - 1];
        lastPeriodStartDate = new Date(mostRecentPeriod.bleedingStartDate);
        let lastPeriodEndDate = new Date(mostRecentPeriod.periodEndDate);

        // Calculate the predicted start date based on the last period start date and the predicted cycle length
        predictedPeriodStartDate = new Date(lastPeriodStartDate.getTime() + predictedCycleLength * (1000 * 60 * 60 * 24));
        predictedPeriodEndDate = new Date(predictedPeriodStartDate.getTime() + averagePeriodDuration * (1000 * 60 * 60 * 24));

        // If the predicted period has already passed, adjust the prediction to the next cycle
        while (predictedPeriodEndDate < today) {
            predictedPeriodStartDate = new Date(predictedPeriodStartDate.getTime() + predictedCycleLength * (1000 * 60 * 60 * 24));
            predictedPeriodEndDate = new Date(predictedPeriodStartDate.getTime() + averagePeriodDuration * (1000 * 60 * 60 * 24));
        }

        // If the current date is more than a week past the predicted end date, assume a period was missed
        if ((today - predictedPeriodEndDate) / (1000 * 60 * 60 * 24) > 7) {
            predictedPeriodStartDate = new Date(predictedPeriodStartDate.getTime() + predictedCycleLength * (1000 * 60 * 60 * 24));
            predictedPeriodEndDate = new Date(predictedPeriodStartDate.getTime() + averagePeriodDuration * (1000 * 60 * 60 * 24));
        }

        // Update the Predict page with the calculated predictions
        document.getElementById("predictedPMSStartDate").textContent = predictedPeriodStartDate.toLocaleDateString();
        document.getElementById("predictedPeriodStartDate").textContent = predictedPeriodStartDate.toLocaleDateString();
        document.getElementById("predictedFlow").textContent = "Average Flow";  // This is a placeholder. More complex analysis would be needed to predict flow.
    };

    getAllDataRequest.onerror = function (e) {
        console.error('Error fetching data from IndexedDB: ', e.target.error);
    };
}