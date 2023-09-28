let db;

// Open IndexedDB
function openDatabase() {
    let openRequest = indexedDB.open("PeriodTracker", 1);

    openRequest.onupgradeneeded = function(e) {
        let db = e.target.result;
        if (!db.objectStoreNames.contains('trackingData')) {
            db.createObjectStore('trackingData', { keyPath: 'id', autoIncrement: true });
        }
    };

    openRequest.onsuccess = function(e) {
        db = e.target.result;
        initializeNavigationLinks(); // Initialize the navigation links
        if (document.getElementById("trackPage").style.display === 'block') {
            checkStatusAndAsk(); // Start the process if on track page
        }
    };

    openRequest.onerror = function(e) {
        console.error('Error opening database');
    };
}

function initializeNavigationLinks() {
    const header = document.getElementById("Title");
    document.querySelectorAll("nav a").forEach((link) => {
        link.addEventListener("click", function(e) {
            const title = e.currentTarget.getAttribute("data-title");
            header.textContent = title;

            // Hide all content divs including the defaultContent
            document.querySelectorAll(".hiddenPage, #defaultContent").forEach((div) => {
                div.style.display = 'none';
            });

            // Show the corresponding content div based on clicked link
            switch(title) {
                case "Track Page":
                    document.getElementById("trackPage").style.display = 'block';
                    checkStatusAndAsk();
                    break;
                case "Predict Page":
                    document.getElementById("predictPage").style.display = 'block';
                    break;
                case "Settings Page":
                    document.getElementById("settingsPage").style.display = 'block';
                    break;
                case "History Page":
                    document.getElementById("historyPage").style.display = 'block';
                    displayHistory(); // Fetch and display history data
                    break;
            }
        });
    });
}


// Function to check status and ask the appropriate question
function checkStatusAndAsk() {
    let transaction = db.transaction(["trackingData"], "readonly");
    let store = transaction.objectStore("trackingData");
    let getLastItem = store.openCursor(null, 'prev');

    getLastItem.onsuccess = function(e) {
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

// Display a specific section and hide others
function displaySection(sectionId) {
    let sections = ['askPMS', 'askBleeding', 'askFlowAmount', 'askFlowStopped'];
    sections.forEach(id => {
        document.getElementById(id).style.display = (id === sectionId) ? 'block' : 'none';
    });
}

function handlePMSStarted(status) {
    if (status) {
        let data = {
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
        updateCurrentPeriod({ bleedingStarted: status, bleedingStartDate: new Date() }, 'askFlowAmount');
    }
}

// Handle Flow Amount
function handleFlowAmount() {
    let flow = document.getElementById('flowAmount').value;
    if (flow) {
        let flowData = { date: new Date(), flowAmount: flow };
        updateCurrentPeriod({ flowData: flowData }, 'askFlowStopped');
    } else {
        console.error("Flow data not captured");
    }
}

// Update the current period with new data
function updateCurrentPeriod(data, nextSection) {
    let transaction = db.transaction(["trackingData"], "readwrite");
    let store = transaction.objectStore("trackingData");
    let getLastItem = store.openCursor(null, 'prev');

    getLastItem.onsuccess = function(e) {
        let cursor = e.target.result;
        if (cursor) {
            let lastData = cursor.value;
            if (data.flowData) {
                lastData.flowData.push(data.flowData);
            } else {
                Object.assign(lastData, data);
            }

            let updateRequest = store.put(lastData);
            updateRequest.onsuccess = function() {
                displaySection(nextSection);
            };
            updateRequest.onerror = function(e) {
                console.error('Error updating data: ', e.target.error);
            };
        }
    };
}

// Handle Flow Stopped
function handleFlowStopped(status) {
    if (status) {
        saveData({ periodEnded: new Date() }, 'askPMS');  // Start over again
    } else {
        saveData({}, 'askFlowAmount');  // Ask about flow amount again
    }
}

// Save Data to IndexedDB
function saveData(data, nextSection) {
    let transaction = db.transaction(["trackingData"], "readwrite");
    let store = transaction.objectStore("trackingData");
    let getLastItem = store.openCursor(null, 'prev');

    getLastItem.onsuccess = function(e) {
        let cursor = e.target.result;
        if (cursor) {
            let lastData = cursor.value;
            let mergedData = { ...lastData, ...data };

            let updateRequest = store.put(mergedData);
            updateRequest.onsuccess = function() {
                displaySection(nextSection);
            };
            updateRequest.onerror = function(e) {
                console.error('Error updating data: ', e.target.error);
            };
        } else {
            let addRequest = store.add(data);
            addRequest.onsuccess = function() {
                displaySection(nextSection);
            };
            addRequest.onerror = function(e) {
                console.error('Error saving data: ', e.target.error);
            };
        }
    };
}

// Initialize database when page loads
window.onload = function() {
    document.getElementById("trackPage").style.display = 'none';  // Initially hide
    openDatabase();
}

// Grouping Data:
function groupDataByPeriod(periods) {
    let groupedData = [];
    let currentPeriod = null;

    periods.forEach(data => {
        // If we have a PMS start and no active period, start a new period
        if (data.pmsStarted && !currentPeriod) {
            currentPeriod = {
                pmsStartDate: data.pmsStartDate,
                days: []
            };
        }

        // If we have an active period and bleeding data, add it to the period
        if (currentPeriod && data.bleedingStarted) {
            currentPeriod.days.push(data);
        }

        // If we have an active period and it's the end, close off the period
        if (currentPeriod && data.periodEnded) {
            currentPeriod.periodEnded = data.periodEnded;
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

function toggleDetails(index) {
    // Collapse all details
    document.querySelectorAll('.period-details').forEach(detail => {
        detail.classList.add('hidden');
    });
    document.querySelectorAll('.expand-icon').forEach(icon => {
        icon.textContent = '[+]';
    });

    // Expand the clicked one
    const targetDetails = document.querySelector(`.period-entry[data-index="${index}"] .period-details`);
    const targetIcon = document.querySelector(`.period-entry[data-index="${index}"] .expand-icon`);
    if (targetDetails && targetIcon) {
        targetDetails.classList.remove('hidden');
        targetIcon.textContent = '[-]';
    }
}

function displayHistory() {
    let transaction = db.transaction(["trackingData"], "readonly");
    let store = transaction.objectStore("trackingData");
    let getAllData = store.getAll();

    getAllData.onsuccess = function(event) {
        let periods = event.target.result;
        console.log("Raw Period Data:", periods); // <-- Log raw data

        // First group the raw data periods
        let groupedPeriods = groupDataByPeriod(periods);

        // Now process each grouped period
        let historyHTML = groupedPeriods.map(period => {
            let pmsStartDate = period.pmsStartDate ? new Date(period.pmsStartDate).toLocaleDateString() : 'N/A';
            let bleedingStartDate = period.days[0] && period.days[0].bleedingStarted ? new Date(period.days[0].bleedingStartDate).toLocaleDateString() : 'N/A';

            // Loop through all the days of a period and capture flow amounts
            let flowAmounts = period.days.map(day => day.flowAmount).filter(Boolean).join(", ");
            if(!flowAmounts) {
                flowAmounts = 'N/A';
            }

            let periodEndedDate = period.periodEnded ? new Date(period.periodEnded).toLocaleDateString() : 'N/A';
            return `
                <div>
                    PMS Start Date: ${pmsStartDate},
                    Bleeding Start Date: ${bleedingStartDate},
                    Flow Amounts: ${flowAmounts},
                    Period Ended: ${periodEndedDate}
                </div>
            `;
        }).join('');

        document.getElementById("historyContent").innerHTML = historyHTML;
    };
}

function toggleDetails(index) {
    // First, collapse all details
    document.querySelectorAll('.period-details').forEach(detail => {
        detail.classList.add('hidden');
    });
    document.querySelectorAll('.expand-icon').forEach(icon => {
        icon.textContent = '[+]';
    });
    
    // Then, expand the selected one
    const selectedPeriod = document.querySelector(`.period-entry[data-index="${index}"]`);
    const detailsDiv = selectedPeriod.querySelector('.period-details');
    const iconSpan = selectedPeriod.querySelector('.expand-icon');

    detailsDiv.classList.remove('hidden');
    iconSpan.textContent = '[-]';
}

function clearHistory() {
    if (confirm("Are you sure you want to clear all period history? This cannot be undone.")) {
        let transaction = db.transaction(["trackingData"], "readwrite");
        let store = transaction.objectStore("trackingData");
        let request = store.clear();

        request.onsuccess = function() {
            alert("History cleared successfully!");
            // If you're on the history page, refresh the display
            if (document.getElementById("historyPage").style.display === 'block') {
                displayHistory();
            }
        };

        request.onerror = function(e) {
            console.error("Error clearing history:", e.target.error);
            alert("Failed to clear history. Please try again.");
        };
    }
}

function groupDataByPeriod(periods) {
    let groupedData = [];
    let currentPeriod = null;

    periods.forEach(data => {
        // If we have a PMS start and no active period, start a new period
        if (data.pmsStarted && !currentPeriod) {
            currentPeriod = {
                pmsStartDate: data.pmsStartDate,
                days: []
            };
        }

        // If we have an active period and bleeding data, add it to the period
        if (currentPeriod && data.bleedingStarted) {
            currentPeriod.days.push({
                date: data.bleedingStartDate,
                flowAmount: data.flowAmount
            });
        }

        // If we have an active period and it's the end, close off the period
        if (currentPeriod && data.periodEnded) {
            currentPeriod.periodEnded = data.periodEnded;
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
