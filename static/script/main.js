function switchView(viewId, clickedBtn) {
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
    });
    if (viewId === 'history-view') { loadHistory(); }

    const targetSection = document.getElementById(viewId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    document.querySelectorAll('.nav-link').forEach(btn => {
        btn.classList.remove('active');
    });
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }
}

async function addEmployee() {
    const name = document.getElementById('new-name').value;
    const wage = document.getElementById('new-wage').value;
    const overtime = document.getElementById('new-overtime').value;
    const bankLimit = document.getElementById('new-bank-limit').value; // ΝΕΟ

    if (!name || !wage) {
        alert("Παρακαλώ συμπληρώστε Όνομα και Ημερομίσθιο!");
        return;
    }

    const newEmployee = {
        name: name,
        daily_wage: parseFloat(wage),      
        overtime_cost: parseFloat(overtime || 0),
        bank_limit: parseFloat(bankLimit || 0) // ΝΕΟ
    };

    try {
        const response = await fetch('/api/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newEmployee) 
        });

        if (response.ok) {
            alert('Ο εργαζόμενος προστέθηκε!');
            document.getElementById('new-name').value = '';
            document.getElementById('new-wage').value = '';
            document.getElementById('new-overtime').value = '';
            document.getElementById('new-bank-limit').value = ''; // Clear
            loadSettingsList(); 
        } else {
            alert('Κάτι πήγε στραβά.');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadSettingsList() {
    try {
        const response = await fetch('/api/employees');
        const employees = await response.json();
        const listElement = document.getElementById('employees-list');
        listElement.innerHTML = ''; 

        employees.forEach(emp => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `
                <div>
                    <strong>${emp.name}</strong><br>
                    <small class="text-muted">
                        €${emp.daily_wage}/μέρα | Τράπεζα: €${emp.bank_limit} | Υπερ: €${emp.overtime_cost}
                    </small>
                </div>
                <div>
                    <span class="badge bg-primary rounded-pill me-2">ID: ${emp.id}</span>
                    <button onclick="deleteEmployee(${emp.id})" class="btn btn-danger btn-sm">X</button>
                </div>
            `;
            listElement.appendChild(li);
        });
    } catch (error) { console.error(error); }
}

async function loadPayrollData() {
    try {
        const response = await fetch('/api/employees');
        const employees = await response.json();
        const tbody = document.getElementById('payroll-table-body');
        tbody.innerHTML = '';

        employees.forEach(emp => {
            const tr = document.createElement('tr');
            // Προσθέσαμε data-bank-limit στο input για να το βλέπει ο υπολογισμός
            // Προσθέσαμε και δύο κελιά (td) για τα αποτελέσματα Τράπεζας/Χεριού
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
                <td class="row-total font-weight-bold">0.00 €</td>
                <td class="row-bank text-primary">0.00 €</td> <td class="row-cash text-success">0.00 €</td> `;
            tbody.appendChild(tr);
        });
    } catch (error) { console.error(error); }
}

function calculateTotal() {
    let grandTotal = 0;
    const rows = document.querySelectorAll('#payroll-table-body tr');

    rows.forEach(row => {
        const daysInput = row.querySelector('.days-input');
        const overtimeInput = row.querySelector('.overtime-input');
        
        const totalCell = row.querySelector('.row-total');
        const bankCell = row.querySelector('.row-bank'); // ΝΕΟ
        const cashCell = row.querySelector('.row-cash'); // ΝΕΟ

        const days = parseFloat(daysInput.value) || 0;
        const overtimeHours = parseFloat(overtimeInput.value) || 0;
        const dailyWage = parseFloat(daysInput.dataset.wage);
        const overtimeCost = parseFloat(overtimeInput.dataset.overtime);
        const bankLimit = parseFloat(daysInput.dataset.bankLimit) || 0; // ΝΕΟ

        // Βασικός Υπολογισμός
        const rowTotal = (days * dailyWage) + (overtimeHours * overtimeCost);

        // --- Η ΛΟΓΙΚΗ ΤΟΥ ΔΙΑΧΩΡΙΣΜΟΥ ---
        let bankPay = 0;
        let cashPay = 0;

        if (rowTotal <= bankLimit) {
            // Αν το σύνολο είναι μικρότερο από το όριο, όλα στην τράπεζα
            bankPay = rowTotal;
            cashPay = 0;
        } else {
            // Αν το ξεπερνάει, γεμίζουμε την τράπεζα και τα υπόλοιπα χέρι
            bankPay = bankLimit;
            cashPay = rowTotal - bankLimit;
        }
        // --------------------------------

        // Εμφάνιση
        totalCell.textContent = rowTotal.toFixed(2) + ' €';
        bankCell.textContent = bankPay.toFixed(2) + ' €';
        cashCell.textContent = cashPay.toFixed(2) + ' €';

        grandTotal += rowTotal;
    });

    document.getElementById('grand-total').textContent = 'Σύνολο: ' + grandTotal.toFixed(2) + ' €';
}

async function saveAndExport() {
    calculateTotal(); // Σιγουρεύουμε ότι τα νούμερα είναι ενημερωμένα
    const dateStart = document.getElementById('dateStart').value;
    const dateEnd = document.getElementById('dateEnd').value;
    
    if (!dateStart || !dateEnd) { alert("Επιλέξτε ημερομηνίες!"); return; }

    const payrollData = [];
    const rows = document.querySelectorAll('#payroll-table-body tr');

    rows.forEach(row => {
        const name = row.cells[0].textContent;
        const days = row.querySelector('.days-input').value || 0;
        const overtime = row.querySelector('.overtime-input').value || 0;
        
        // Διαβάζουμε τα υπολογισμένα ποσά
        const total = parseFloat(row.querySelector('.row-total').textContent);
        const bank = parseFloat(row.querySelector('.row-bank').textContent);
        const cash = parseFloat(row.querySelector('.row-cash').textContent);

        if (total > 0) {
            payrollData.push({
                name: name,
                days: days,
                overtime_hours: overtime,
                total_pay: total,
                bank_pay: bank, // Στέλνουμε και αυτά στο backend
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
            // Χρησιμοποιούμε το white-space: pre-line για να φαίνονται οι αλλαγές γραμμής στο details
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