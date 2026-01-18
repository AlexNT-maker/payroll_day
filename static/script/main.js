/**
 * Συνάρτηση αλλαγής σελίδας (View)
 * @param {string} viewId - Το ID του div που θέλουμε να εμφανίσουμε (π.χ. 'settings-view')
 * @param {HTMLElement} clickedBtn - Το κουμπί που πατήθηκε (για να το κάνουμε active)
 */
function switchView(viewId, clickedBtn) {
    // 1. Κρύψε ΟΛΑ τα sections (αφαιρώντας την κλάση 'active')
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
        if (viewId === 'history-view') {
        loadHistory(); }
    });

    // 2. Εμφάνισε ΜΟΝΟ το section που θέλουμε
    const targetSection = document.getElementById(viewId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // 3. Ενημέρωσε το Μενού (ποιο κουμπί είναι πατημένο)
    // Αφαιρούμε το 'active' από όλα τα κουμπιά
    document.querySelectorAll('.nav-link').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Προσθέτουμε το 'active' μόνο στο κουμπί που πατήθηκε (αν υπάρχει)
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }
} // <--- ΕΔΩ ΕΛΕΙΠΕ Η ΑΓΚΥΛΗ ΠΟΥ ΚΛΕΙΝΕΙ ΤΗ SWITCHVIEW

/**
 * Στέλνει τα δεδομένα του νέου εργαζομένου στο Backend
 */
async function addEmployee() {
    // 1. Μαζεύουμε τις τιμές από τα inputs
    const nameInput = document.getElementById('new-name');
    const wageInput = document.getElementById('new-wage');
    const overtimeInput = document.getElementById('new-overtime');

    const name = nameInput.value;
    const wage = wageInput.value;
    const overtime = overtimeInput.value;

    // 2. Έλεγχος: Αν είναι κενά, μην κάνεις τίποτα
    if (!name || !wage) {
        alert("Παρακαλώ συμπληρώστε Όνομα και Ημερομίσθιο!");
        return;
    }

    // 3. Δημιουργούμε το αντικείμενο (το πακέτο)
    const newEmployee = {
        name: name,
        daily_wage: parseFloat(wage),      
        overtime_cost: parseFloat(overtime || 0) 
    };

    try {
        // 4. Στέλνουμε το πακέτο με POST request
        const response = await fetch('/api/employees', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newEmployee) 
        });

        if (response.ok) {
            alert('Ο εργαζόμενος προστέθηκε!');
            
            // Καθαρίζουμε τα πεδία
            nameInput.value = '';
            wageInput.value = '';
            overtimeInput.value = '';

            // Ανανεώνουμε τη λίστα
            loadSettingsList(); 
        } else {
            alert('Κάτι πήγε στραβά με την αποθήκευση.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Σφάλμα επικοινωνίας με τον server.');
    }
}

/**
 * Φέρνει τους εργαζόμενους και τους εμφανίζει στη λίστα των Ρυθμίσεων
 */
/**
 * Φέρνει τους εργαζόμενους και τους εμφανίζει στη λίστα των Ρυθμίσεων
 */
async function loadSettingsList() {
    try {
        const response = await fetch('/api/employees');
        const employees = await response.json();

        const listElement = document.getElementById('employees-list');
        listElement.innerHTML = ''; 

        employees.forEach(emp => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            
            // Προσθέσαμε το κουμπί DELETE στα δεξιά
            li.innerHTML = `
                <div>
                    <strong>${emp.name}</strong><br>
                    <small class="text-muted">€${emp.daily_wage}/μέρα - €${emp.overtime_cost}/ώρα</small>
                </div>
                <div>
                    <span class="badge bg-primary rounded-pill me-2">ID: ${emp.id}</span>
                    <button onclick="deleteEmployee(${emp.id})" class="btn btn-danger btn-sm">X</button>
                </div>
            `;
            
            listElement.appendChild(li);
        });

    } catch (error) {
        console.error('Error loading employees:', error);
    }
}
/**
 * Φέρνει τους εργαζόμενους στον Πίνακα Μισθοδοσίας (Home)
 * και δημιουργεί τα κουτάκια για να γράψουμε μέρες/υπερωρίες.
 */
async function loadPayrollData() {
    try {
        const response = await fetch('/api/employees');
        const employees = await response.json();

        const tbody = document.getElementById('payroll-table-body');
        tbody.innerHTML = ''; // Καθαρίζουμε τον πίνακα

        employees.forEach(emp => {
            const tr = document.createElement('tr');
            
            // Εδώ φτιάχνουμε τη γραμμή με τα INPUTS για υπολογισμό
            tr.innerHTML = `
                <td>${emp.name}</td>
                <td>${emp.daily_wage} €</td>
                <td>${emp.overtime_cost} €</td>
                <td>
                    <input type="number" class="form-control days-input" 
                           data-wage="${emp.daily_wage}" placeholder="0">
                </td>
                <td>
                    <input type="number" class="form-control overtime-input" 
                           data-overtime="${emp.overtime_cost}" placeholder="0">
                </td>
                <td class="row-total font-weight-bold">0.00 €</td>
            `;
            
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error loading payroll data:', error);
    }
}

/**
 * Υπολογίζει το σύνολο για κάθε εργαζόμενο και το γενικό σύνολο
 */
function calculateTotal() {
    let grandTotal = 0;
    
    // 1. Βρίσκουμε όλες τις γραμμές του πίνακα
    const rows = document.querySelectorAll('#payroll-table-body tr');

    rows.forEach(row => {
        // 2. Βρίσκουμε τα inputs και τα data attributes για κάθε γραμμή
        const daysInput = row.querySelector('.days-input');
        const overtimeInput = row.querySelector('.overtime-input');
        const totalCell = row.querySelector('.row-total');

        // Τιμές από τα κουτάκια (αν είναι κενό, βάζουμε 0)
        const days = parseFloat(daysInput.value) || 0;
        const overtimeHours = parseFloat(overtimeInput.value) || 0;

        // Τιμές από τη βάση (που κρύψαμε στα data attributes)
        const dailyWage = parseFloat(daysInput.dataset.wage);
        const overtimeCost = parseFloat(overtimeInput.dataset.overtime);

        // 3. Μαθηματικά: (Μέρες * Μισθός) + (Ώρες * Υπερωρία)
        const rowTotal = (days * dailyWage) + (overtimeHours * overtimeCost);

        // 4. Ενημερώνουμε το κελί του συνόλου στη γραμμή
        totalCell.textContent = rowTotal.toFixed(2) + ' €';

        // Προσθέτουμε στο γενικό σύνολο
        grandTotal += rowTotal;
    });

    // 5. Ενημερώνουμε το Γενικό Σύνολο κάτω δεξιά
    document.getElementById('grand-total').textContent = 'Σύνολο: ' + grandTotal.toFixed(2) + ' €';
}

/**
 * Μαζεύει τα δεδομένα και τα στέλνει στο Backend για αποθήκευση/PDF
 */
async function saveAndExport() {
    // Πρώτα κάνουμε έναν υπολογισμό για σιγουριά
    calculateTotal();

    const dateStart = document.getElementById('dateStart').value;
    const dateEnd = document.getElementById('dateEnd').value;
    
    if (!dateStart || !dateEnd) {
        alert("Παρακαλώ επιλέξτε ημερομηνίες Από/Έως!");
        return;
    }

    // Μαζεύουμε τα δεδομένα του πίνακα σε μια λίστα
    const payrollData = [];
    const rows = document.querySelectorAll('#payroll-table-body tr');

    rows.forEach(row => {
        const name = row.cells[0].textContent; // Το όνομα είναι στο 1ο κελί
        const days = row.querySelector('.days-input').value || 0;
        const overtime = row.querySelector('.overtime-input').value || 0;
        const totalText = row.querySelector('.row-total').textContent;
        const total = parseFloat(totalText.replace(' €', '')); // Βγάζουμε το σύμβολο €

        // Κρατάμε μόνο όσους έχουν δουλέψει (έχουν ποσό > 0)
        if (total > 0) {
            payrollData.push({
                name: name,
                days: days,
                overtime_hours: overtime,
                total_pay: total
            });
        }
    });

    if (payrollData.length === 0) {
        alert("Δεν υπάρχουν δεδομένα για αποθήκευση!");
        return;
    }

    // Φτιάχνουμε το τελικό πακέτο
    const payload = {
        date_start: dateStart,
        date_end: dateEnd,
        employees: payrollData
    };

    try {
        // Στέλνουμε στο Backend
        const response = await fetch('/api/save_payroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            // Αν όλα πήγαν καλά, το Backend μας στέλνει πίσω το PDF (Blob)
            const blob = await response.blob();
            
            // Κόλπο για να κατέβει το αρχείο στον browser
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `misthodosia_${dateStart}.pdf`;
            document.body.appendChild(a); // Το προσθέτουμε προσωρινά
            a.click(); // Το "πατάμε"
            a.remove(); // Το διαγράφουμε
            
            alert("Η μισθοδοσία αποθηκεύτηκε και το PDF κατέβηκε!");
        } else {
            alert("Σφάλμα κατά την αποθήκευση.");
        }
    } catch (error) {
        console.error('Error:', error);
        alert("Σφάλμα επικοινωνίας.");
    }
}

/**
 * Διαγράφει (κάνει ανενεργό) έναν εργαζόμενο
 */
async function deleteEmployee(id) {
    if (!confirm("Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτόν τον εργαζόμενο;")) {
        return;
    }

    try {
        const response = await fetch('/api/employees/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });

        if (response.ok) {
            // Ανανεώνουμε και τις δύο λίστες (Ρυθμίσεις και Home)
            loadSettingsList();
            loadPayrollData();
        } else {
            alert("Σφάλμα κατά τη διαγραφή.");
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

/**
 * Φορτώνει και εμφανίζει το ιστορικό πληρωμών
 */
async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const history = await response.json();
        
        const list = document.getElementById('history-list');
        list.innerHTML = ''; // Καθαρισμός

        if (history.length === 0) {
            list.innerHTML = '<div class="alert alert-info">Δεν υπάρχει ιστορικό ακόμα.</div>';
            return;
        }

        history.forEach(rec => {
            const item = document.createElement('div');
            item.className = 'card mb-3 shadow-sm'; // Κάθε εγγραφή είναι μια κάρτα
            
            // Μορφοποίηση ημερομηνίας για να φαίνεται ωραία
            const createdDate = new Date(rec.date_created).toLocaleString('el-GR');

            item.innerHTML = `
                <div class="card-header d-flex justify-content-between bg-light">
                    <strong>Περίοδος: ${rec.date_start} έως ${rec.date_end}</strong>
                    <span class="badge bg-success fs-6">${rec.total_cost.toFixed(2)} €</span>
                </div>
                <div class="card-body">
                    <p class="card-text text-muted mb-2"><small>Δημιουργήθηκε: ${createdDate}</small></p>
                    <div class="p-2 bg-white border rounded">
                        ${rec.details}
                    </div>
                </div>
            `;
            list.appendChild(item);
        });

    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// Εκκίνηση
document.addEventListener('DOMContentLoaded', loadSettingsList);