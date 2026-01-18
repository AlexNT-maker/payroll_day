import sqlite3
import os
from flask import Flask, render_template, jsonify, request, send_file
from flask_cors import CORS
from fpdf import FPDF
import datetime

app = Flask(__name__)
CORS(app)

DB_NAME = "payroll.db"

# --- ΡΥΘΜΙΣΕΙΣ PDF ---
class PDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, 'Paraponiaris Bros - Payroll Report', 0, 1, 'C')
        self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')

# --- ΒΑΣΗ ΔΕΔΟΜΕΝΩΝ ---
def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row 
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            daily_wage REAL NOT NULL,
            overtime_cost REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS payroll_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_created TEXT,
            date_start TEXT,
            date_end TEXT,
            total_cost REAL,
            details TEXT
        )
    ''')

    conn.commit()
    conn.close()
    print("Successful initialization of database")

# --- ROUTES ---

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/api/employees', methods=['GET'])
def get_employees():
    conn = get_db_connection()
    employees = conn.execute('SELECT * FROM employees WHERE is_active = 1').fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in employees])

@app.route('/api/employees', methods=['POST']) 
def add_employee():
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO employees (name, daily_wage, overtime_cost) VALUES (?, ?, ?)', 
                   (data.get('name'), data.get('daily_wage'), data.get('overtime_cost')))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({'id': new_id, 'message': 'Employee added'}), 201

# --- ΤΟ ΝΕΟ ROUTE ΓΙΑ ΑΠΟΘΗΚΕΥΣΗ & PDF ---
@app.route('/api/save_payroll', methods=['POST'])
def save_payroll():
    data = request.json
    date_start = data.get('date_start')
    date_end = data.get('date_end')
    employees = data.get('employees')
    
    # 1. Υπολογισμός συνολικού κόστους
    grand_total = sum(emp['total_pay'] for emp in employees)

    # 2. Αποθήκευση στη Βάση (Ιστορικό)
    conn = get_db_connection()
    cursor = conn.cursor()
    today = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Αποθηκεύουμε τα ονόματα και τα ποσά ως απλό κείμενο στη στήλη details
    details_str = ", ".join([f"{e['name']}: {e['total_pay']}€" for e in employees])
    
    cursor.execute('''
        INSERT INTO payroll_history (date_created, date_start, date_end, total_cost, details)
        VALUES (?, ?, ?, ?, ?)
    ''', (today, date_start, date_end, grand_total, details_str))
    
    conn.commit()
    conn.close()

    # 3. Δημιουργία PDF
    pdf = PDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    
    # Πληροφορίες περιόδου
    pdf.cell(0, 10, f"Period: {date_start} to {date_end}", 0, 1)
    pdf.cell(0, 10, f"Created at: {today}", 0, 1)
    pdf.ln(5)

    # Επικεφαλίδες Πίνακα
    pdf.set_font("Arial", 'B', 12)
    pdf.cell(60, 10, "Employee", 1)
    pdf.cell(30, 10, "Days", 1)
    pdf.cell(30, 10, "Overtime", 1)
    pdf.cell(40, 10, "Total", 1)
    pdf.ln()

    # Δεδομένα Πίνακα
    pdf.set_font("Arial", size=12)
    for emp in employees:
        # Προσοχή: Το FPDF δεν υποστηρίζει καλά Ελληνικά από default (θέλει ειδική γραμματοσειρά).
        # Για τώρα θα χρησιμοποιήσουμε λατινικούς χαρακτήρες ή θα δούμε "kineziaka" αν γράψεις Ελληνικά.
        # Θα σου πω πώς να βάλεις ελληνική γραμματοσειρά στο επόμενο βήμα.
        pdf.cell(60, 10, str(emp['name']), 1)
        pdf.cell(30, 10, str(emp['days']), 1)
        pdf.cell(30, 10, str(emp['overtime_hours']), 1)
        pdf.cell(40, 10, f"{emp['total_pay']:.2f} EUR", 1)
        pdf.ln()

    pdf.ln(5)
    pdf.set_font("Arial", 'B', 14)
    pdf.cell(0, 10, f"Grand Total: {grand_total:.2f} EUR", 0, 1, 'R')

    # Αποθήκευση προσωρινά
    pdf_filename = f"payroll_{date_start}.pdf"
    pdf.output(pdf_filename)

    # 4. Αποστολή του αρχείου στον χρήστη
    try:
        return send_file(pdf_filename, as_attachment=True, download_name=pdf_filename)
    finally:
        # Προαιρετικά: Διαγραφή του αρχείου από τον server αφού σταλεί (για να μην γεμίζεις σκουπίδια)
        # os.remove(pdf_filename) 
        pass

# --- ΝΕΑ ROUTES ΓΙΑ ΔΙΑΓΡΑΦΗ ΚΑΙ ΙΣΤΟΡΙΚΟ ---

# API: Διαγραφή εργαζομένου (Soft Delete)
@app.route('/api/employees/delete', methods=['POST'])
def delete_employee():
    data = request.json
    emp_id = data.get('id')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    # Τον κάνουμε inactive αντί να τον σβήσουμε τελείως
    cursor.execute('UPDATE employees SET is_active = 0 WHERE id = ?', (emp_id,))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Employee deleted'}), 200

# API: Λήψη Ιστορικού
@app.route('/api/history', methods=['GET'])
def get_history():
    conn = get_db_connection()
    # Τα φέρνουμε με σειρά (το πιο πρόσφατο πρώτο -> DESC)
    history = conn.execute('SELECT * FROM payroll_history ORDER BY date_created DESC').fetchall()
    conn.close()
    
    return jsonify([dict(ix) for ix in history])


if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)