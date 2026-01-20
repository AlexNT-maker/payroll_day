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
        self.set_font('Arial', 'B', 14)
        self.cell(0, 10, 'Paraponiaris Bros - Payroll Report', 0, 1, 'C')
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row 
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Προσθέσαμε το bank_limit
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            daily_wage REAL NOT NULL,
            overtime_cost REAL DEFAULT 0,
            bank_limit REAL DEFAULT 0,
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
    # Αποθηκεύουμε και το bank_limit
    cursor.execute('INSERT INTO employees (name, daily_wage, overtime_cost, bank_limit) VALUES (?, ?, ?, ?)', 
                   (data.get('name'), data.get('daily_wage'), data.get('overtime_cost'), data.get('bank_limit')))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({'id': new_id, 'message': 'Employee added'}), 201

@app.route('/api/employees/delete', methods=['POST'])
def delete_employee():
    data = request.json
    emp_id = data.get('id')
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE employees SET is_active = 0 WHERE id = ?', (emp_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Employee deleted'}), 200

@app.route('/api/history', methods=['GET'])
def get_history():
    conn = get_db_connection()
    history = conn.execute('SELECT * FROM payroll_history ORDER BY date_created DESC').fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in history])

@app.route('/api/save_payroll', methods=['POST'])
def save_payroll():
    data = request.json
    date_start = data.get('date_start')
    date_end = data.get('date_end')
    employees = data.get('employees')
    
    grand_total = sum(emp['total_pay'] for emp in employees)

    conn = get_db_connection()
    cursor = conn.cursor()
    today = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Στο ιστορικό θα αποθηκεύουμε αναλυτικά τι πήγε πού
    details_str = "\n".join([f"{e['name']}: Total {e['total_pay']}€ (Bank: {e['bank_pay']}€ | Cash: {e['cash_pay']}€)" for e in employees])
    
    cursor.execute('''
        INSERT INTO payroll_history (date_created, date_start, date_end, total_cost, details)
        VALUES (?, ?, ?, ?, ?)
    ''', (today, date_start, date_end, grand_total, details_str))
    
    conn.commit()
    conn.close()

    # --- ΔΗΜΙΟΥΡΓΙΑ PDF ΜΕ ΤΙΣ ΝΕΕΣ ΣΤΗΛΕΣ ---
    pdf = PDF()
    pdf.add_page()
    pdf.set_font("Arial", size=10)
    
    pdf.cell(0, 10, f"Period: {date_start} to {date_end}", 0, 1)
    pdf.cell(0, 10, f"Created at: {today}", 0, 1)
    pdf.ln(5)

    # Επικεφαλίδες (Μικραίνουμε λίγο τα πλάτη για να χωρέσουν όλα)
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(45, 10, "Employee", 1)
    pdf.cell(15, 10, "Days", 1)
    pdf.cell(20, 10, "Overtime", 1)
    pdf.cell(30, 10, "Total", 1)
    pdf.cell(30, 10, "Bank", 1)  # Νέα στήλη
    pdf.cell(30, 10, "Cash", 1)  # Νέα στήλη
    pdf.ln()

    pdf.set_font("Arial", size=10)
    for emp in employees:
        pdf.cell(45, 10, str(emp['name']), 1)
        pdf.cell(15, 10, str(emp['days']), 1)
        pdf.cell(20, 10, str(emp['overtime_hours']), 1)
        pdf.cell(30, 10, f"{emp['total_pay']:.2f}", 1)
        pdf.cell(30, 10, f"{emp['bank_pay']:.2f}", 1) # Τράπεζα
        pdf.cell(30, 10, f"{emp['cash_pay']:.2f}", 1) # Χέρι
        pdf.ln()

    pdf.ln(5)
    pdf.set_font("Arial", 'B', 12)
    pdf.cell(0, 10, f"Grand Total Cost: {grand_total:.2f} EUR", 0, 1, 'R')

    pdf_filename = f"payroll_{date_start}.pdf"
    pdf.output(pdf_filename)

    try:
        return send_file(pdf_filename, as_attachment=True, download_name=pdf_filename)
    finally:
        pass

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)