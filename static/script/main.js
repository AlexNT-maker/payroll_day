/**
 * ------------------------------------------------------------------
 * PAYROLL MANAGER - FRONTEND LOGIC
 * ------------------------------------------------------------------
 * This file handles all user interactions, API calls to the Python backend,
 * and dynamic updates to the HTML page (DOM).
 */

/**
 * Handles switching between different views (Tabs) in the Single Page Application (SPA).
 * Instead of loading a new page, we hide/show div sections.
 * * @param {string} viewId - The HTML ID of the section to show (e.g., 'home-view').
 * @param {HTMLElement} clickedBtn - The navigation button that was clicked.
 */
 

function switchView(viewId, clickedBtn) {
    // Hide all view sections first
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
    });

    // Special Case: If switching to the History tab, fetch the latest history data immediately.
    if (viewId === 'history-view') { loadHistory(); }

    // Find and show the specific target section
    const targetSection = document.getElementById(viewId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Update the visual state of the nav-bar buttons
    document.querySelectorAll('.nav-link').forEach(btn => {
        btn.classList.remove('active');
    });
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }
}

/**
 * Sends a POST request to the Backend to add a new employee.
 * Triggered by the "Add" button in the Settings view.
 */

async function addEmployee() {
    // Collect values from the input fields
    const name = document.getElementById('new-name').value;
    const wage = document.getElementById('new-wage').value;
    const overtime = document.getElementById('new-overtime').value;
    const bankLimit = document.getElementById('new-bank-limit').value; 

    // Basic Validation: Ensure required fields are filled
    if (!name || !wage) {
        alert("Παρακαλώ συμπληρώστε Όνομα και Ημερομίσθιο!");
        return;
    }

    // Create the data object to send
    // We use parseFloat to ensure numbers are numbers, not strings.
    // The "|| 0" part ensures that if the field is empty, we send 0 instead of NaN.
    const newEmployee = {
        name: name,
        daily_wage: parseFloat(wage),      
        overtime_cost: parseFloat(overtime || 0),
        bank_limit: parseFloat(bankLimit || 0) 
    };

    // Send the data to the Python server using the Fetch API
    try {
        const response = await fetch('/api/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newEmployee) 
        });

        if (response.ok) {
           // Clear the input fields for the next entry
            alert('Ο εργαζόμενος προστέθηκε!');
            document.getElementById('new-name').value = '';
            document.getElementById('new-wage').value = '';
            document.getElementById('new-overtime').value = '';
            document.getElementById('new-bank-limit').value = ''; // Clear

            // Refresh the settings list to show the new employee
            loadSettingsList(); 
        } else {
            alert('Κάτι πήγε στραβά.');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

/**
 * Fetches the list of employees from the DB and renders it in the Settings page.
 * Each item includes an 'Edit' and 'Delete' button.
 */
async function loadSettingsList() {
    try {
        // GET request to fetch all employees
        const response = await fetch('/api/employees');
        const employees = await response.json();
        // Locate the list container in HTML and clear it
        const listElement = document.getElementById('employees-list');
        listElement.innerHTML = ''; 
        
        // Loop through each employee and create a list item (li)
        employees.forEach(emp => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            
            // Safety: Escape single quotes in names (e.g. O'Neil) to prevent JS errors in the onclick string
            const safeName = emp.name.replace(/'/g, "\\'"); 
            
            // Inject HTML for the list item
            li.innerHTML = `
                <div>
                    <strong>${emp.name}</strong><br>
                    <small class="text-muted">
                        €${emp.daily_wage}/μέρα | Τράπεζα: €${emp.bank_limit} | Υπερ: €${emp.overtime_cost}
                    </small>
                </div>
                <div>
                    <span class="badge bg-primary rounded-pill me-2">ID: ${emp.id}</span>
                    <button onclick="openEditModal(${emp.id}, '${safeName}', ${emp.daily_wage}, ${emp.bank_limit}, ${emp.overtime_cost})" 
                            class="btn btn-warning btn-sm me-1">
                        <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button onclick="deleteEmployee(${emp.id})" class="btn btn-danger btn-sm">X</button>
                </div>
            `;
            listElement.appendChild(li);
        });
    } catch (error) { console.error(error); }
}

/**
 * Fetches employees and renders the Main Payroll Table (Home View).
 * Creates input fields for 'Days' and 'Overtime' for each employee.
 */
async function loadPayrollData() {
    try {
        const response = await fetch('/api/employees');
        const employees = await response.json();
        const tbody = document.getElementById('payroll-table-body');
        tbody.innerHTML = '';

        employees.forEach(emp => {
            const tr = document.createElement('tr');
            
            // Render the table row.
            // KEY CONCEPT: 'data-*' attributes.
            // We store the static values (wage, bank limit, overtime cost) inside the input HTML tags.
            // This allows the 'calculateTotal' function to easily read them later without asking the database again.
            tr.innerHTML = `
                <td>${emp.name}</td>
                <td>${emp.daily_wage} €</td>
                <td>${emp.overtime_cost} €</td>
                <td>
                    <input type="number" class="form-control days-input" 
                           data-wage="${emp.daily_wage}" 
                           data-bank-limit="${emp.bank_limit}" placeholder="0">
                </td>
                <td>
                    <input type="number" class="form-control overtime-input" 
                           data-overtime="${emp.overtime_cost}" placeholder="0">
                </td>
                <td class="row-bank text-primary fw-bold">0.00 €</td>
                <td class="row-cash text-success fw-bold">0.00 €</td>
                <td class="row-total fw-bold text-black">0.00 €</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) { console.error(error); }
}

/**
 * CORE LOGIC: Calculates totals based on user input.
 * Handles the logic for splitting the total into Bank vs Cash.
 */
function calculateTotal() {
    let grandTotal = 0;
    // Select all rows in the payroll table
    const rows = document.querySelectorAll('#payroll-table-body tr');

    rows.forEach(row => {
        // Get references to input fields and output cells for this specific row
        const daysInput = row.querySelector('.days-input');
        const overtimeInput = row.querySelector('.overtime-input');
        
        const totalCell = row.querySelector('.row-total');
        const bankCell = row.querySelector('.row-bank');
        const cashCell = row.querySelector('.row-cash');

        // Read values user typed (User Input)
        const days = parseFloat(daysInput.value) || 0;
        const overtimeHours = parseFloat(overtimeInput.value) || 0;
        
        // Read static values from data-attributes (Database Data)
        const dailyWage = parseFloat(daysInput.dataset.wage);
        const overtimeCost = parseFloat(overtimeInput.dataset.overtime);
        const bankLimit = parseFloat(daysInput.dataset.bankLimit) || 0;

        // Calculate Earnings
        const wageTotal = days * dailyWage;           
        const overtimeTotal = overtimeHours * overtimeCost; 
        const grandRowTotal = wageTotal + overtimeTotal;    

        // BANK vs CASH Logic
        // Rule: Bank amount is determined by the Limit, BUT it cannot exceed the earned WAGE.
        // Example A: Limit=600, Wage Earned=500. Bank gets 500 (can't deposit more than earned).
        // Example B: Limit=600, Wage Earned=2000. Bank gets 600 (hit the limit).
        let bankPay = 0;
        
        if (bankLimit > 0) {
            bankPay = Math.min(bankLimit, wageTotal);
        } else {
            bankPay = 0; 
        }

        // Cash Logic
        // Cash gets everything remaining (Rest of Wage + All Overtime)
        const cashPay = grandRowTotal - bankPay;

        // Update the UI cells with formatted numbers (2 decimals)
        bankCell.textContent = bankPay.toFixed(2) + ' €';
        cashCell.textContent = cashPay.toFixed(2) + ' €';
        totalCell.textContent = grandRowTotal.toFixed(2) + ' €';

        // Add to Grand Total
        grandTotal += grandRowTotal;
    });

    // Update the footer total
    document.getElementById('grand-total').textContent = 'Σύνολο: ' + grandTotal.toFixed(2) + ' €';
}

function openEditModal(id, name, wage, bankLimit, overtime) {
    // Fill the inputs in the modal
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-name').value = name;
    document.getElementById('edit-wage').value = wage;
    document.getElementById('edit-bank-limit').value = bankLimit;
    document.getElementById('edit-overtime').value = overtime;

    // Show the Modal using Bootstrap 5 API
    const modalElement = document.getElementById('editEmployeeModal');
    editModalInstance = new bootstrap.Modal(modalElement);
    editModalInstance.show();
}

/**
 * Collects updated data from the Modal and sends it to the Backend.
 */
async function saveEmployeeChanges() {
    // Gather data from modal inputs
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('edit-name').value;
    const wage = document.getElementById('edit-wage').value;
    const bankLimit = document.getElementById('edit-bank-limit').value;
    const overtime = document.getElementById('edit-overtime').value;

    const updatedData = {
        id: id,
        name: name,
        daily_wage: parseFloat(wage),
        bank_limit: parseFloat(bankLimit || 0), // Default to 0 if empty
        overtime_cost: parseFloat(overtime || 0)
    };

    try {
        const response = await fetch('/api/employees/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });

        if (response.ok) {
            alert("Οι αλλαγές αποθηκεύτηκαν!");
            if (editModalInstance) {
                editModalInstance.hide();
            }
            // Refresh lists to reflect changes immediately
            loadSettingsList();
            loadPayrollData();
        } else {
            alert("Σφάλμα κατά την ενημέρωση.");
        }
    } catch (error) {
        console.error('Error:', error);
    }
}


/**
 * Collects all calculated data, sends it to the backend to save in history,
 * and handles the PDF file download.
 */
async function saveAndExport() {
    // Recalculate everything to ensure numbers are fresh
    calculateTotal(); 
    // Get Dates
    const dateStart = document.getElementById('dateStart').value;
    const dateEnd = document.getElementById('dateEnd').value;
    
    if (!dateStart || !dateEnd) { alert("Επιλέξτε ημερομηνίες!"); return; }

    // Scrape the table to build the data payload
    const payrollData = [];
    const rows = document.querySelectorAll('#payroll-table-body tr');

    rows.forEach(row => {
        const name = row.cells[0].textContent;
        // Get Inputs
        const days = row.querySelector('.days-input').value || 0;
        const overtime = row.querySelector('.overtime-input').value || 0;
        
        // Get Calculated Results (parse string "1200.00 €" -> float 1200.00)
        const total = parseFloat(row.querySelector('.row-total').textContent);
        const bank = parseFloat(row.querySelector('.row-bank').textContent);
        const cash = parseFloat(row.querySelector('.row-cash').textContent);

        // Only save employees with a positive total
        if (total > 0) {
            payrollData.push({
                name: name,
                days: days,
                overtime_hours: overtime,
                total_pay: total,
                bank_pay: bank, 
                cash_pay: cash
            });
        }
    });

    if (payrollData.length === 0) { alert("Δεν υπάρχουν δεδομένα!"); return; }

    try {
        const response = await fetch('/api/save_payroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date_start: dateStart,
                date_end: dateEnd,
                employees: payrollData
            })
        });

        if (response.ok) {
            // 5. Handle File Download (Blob)
            // The backend returns a PDF binary file (Blob). 
            // We create a temporary invisible link in the browser to trigger the download.
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `misthodosia_${dateStart}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            alert("Επιτυχία!");
        } else { alert("Σφάλμα."); }
    } catch (error) { console.error(error); }
}

/**
 * Soft deletes an employee (sets is_active = 0).
 */
async function deleteEmployee(id) {
    if (!confirm("Διαγραφή;")) return;
    try {
        const response = await fetch('/api/employees/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        if (response.ok) { loadSettingsList(); loadPayrollData(); }
    } catch (error) { console.error(error); }
}


/**
 * Fetches and displays the payroll history.
 */
async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const history = await response.json();
        const list = document.getElementById('history-list');
        list.innerHTML = ''; 
        
        if (history.length === 0) { list.innerHTML = 'Κενό.'; return; }

        history.forEach(rec => {
            const item = document.createElement('div');
            item.className = 'card mb-3 shadow-sm';
            // Format Date for display
            /// CSS 'white-space: pre-line' respects the \n newlines in the details string
            item.innerHTML = `
                <div class="card-header d-flex justify-content-between bg-light">
                    <strong>${rec.date_start} - ${rec.date_end}</strong>
                    <span class="badge bg-success">${rec.total_cost.toFixed(2)} €</span>
                </div>
                <div class="card-body">
                    <div class="p-2 bg-white border rounded" style="white-space: pre-line;">
                        ${rec.details}
                    </div>
                </div>
            `;
            list.appendChild(item);
        });
    } catch (error) { console.error(error); }
}

document.addEventListener('DOMContentLoaded', loadSettingsList);