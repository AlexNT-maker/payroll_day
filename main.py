import sqlite3
import os
from flask import Flask, render_template, jsonify, request, send_file
from flask_cors import CORS
from fpdf import FPDF
import datetime

# Initialize the flask application
app = Flask(__name__)

# Enable Cross origin resource sharing. 
CORS(app)

# Database configuration
DB_NAME = "payroll.db"

# --- PDF CLASS CONFIGURATION ---
class PDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 14)
        self.cell(0, 10, 'Paraponiaris Bros - Payroll Report', 0, 1, 'C')
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')

#--- Database helpers ---
def get_db_connection():
    """Establish a connection to the SQLITE database"""
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row 
    return conn

def init_db():
    """Initializes the databases tables if they do not exist"""
    conn = get_db_connection()
    cursor = conn.cursor()

 # Creates employees table
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
    
# Creates payroll history
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

# --- API ROUTES ---

@app.route('/')
def index():
    """Serves the main page"""
    return render_template("index.html")

# --- Employees management ---

@app.route('/api/employees', methods=['GET'])
def get_employees():
    """Fetch all active employees from the database."""
    conn = get_db_connection()
    employees = conn.execute('SELECT * FROM employees WHERE is_active = 1').fetchall()  # Fetch only active employees
    conn.close()
    return jsonify([dict(ix) for ix in employees]) # Convert database rows to a list of dictionaries (JSON Format)

@app.route('/api/employees', methods=['POST']) 
def add_employee():
    """Adds a new employee to the database."""
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO employees (name, daily_wage, overtime_cost, bank_limit) VALUES (?, ?, ?, ?)', 
                   (data.get('name'), data.get('daily_wage'), data.get('overtime_cost'), data.get('bank_limit')))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({'id': new_id, 'message': 'Employee added'}), 201

@app.route('/api/employees/delete', methods=['POST'])
def delete_employee():
    """
    Performs a 'Soft delete'
     Instead of removing the row, we set is_active = 0 so historical data remains intact.
       """
    data = request.json
    emp_id = data.get('id')
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE employees SET is_active = 0 WHERE id = ?', (emp_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Employee deleted'}), 200

@app.route('/api/employees/update', methods=['POST'])
def update_employee():
    """Updates the employee details."""
    data = request.json

    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE employees 
        SET name = ?, daily_wage = ?, overtime_cost = ?, bank_limit = ?
        WHERE id = ?
    ''', (
        data.get('name'), 
        data.get('daily_wage'), 
        data.get('overtime_cost'), 
        data.get('bank_limit'),
        data.get('id')
    ))
    
    conn.commit()
    conn.close()
    return jsonify({'message': 'Employee updated successfully'}), 200

@app.route('/api/history', methods=['GET'])
def get_history():
    """Returns the history of existing payments. Sorted by newest first"""
    conn = get_db_connection()
    history = conn.execute('SELECT * FROM payroll_history ORDER BY date_created DESC').fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in history])

@app.route('/api/save_payroll', methods=['POST'])
def save_payroll():
    """
    1. Saves the calculated payroll to the database history.
    2. Generates a PDF report.
    3. Sends the PDF back to the user for download.
    """
    data = request.json
    date_start = data.get('date_start')
    date_end = data.get('date_end')
    employees = data.get('employees')
    
    grand_total = sum(emp['total_pay'] for emp in employees)  # calculate grand total   

    conn = get_db_connection()
    cursor = conn.cursor()
    today = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Creates a string summary for the details column
    details_str = "\n".join([f"{e['name']}: Total {e['total_pay']}€ (Bank: {e['bank_pay']}€ | Cash: {e['cash_pay']}€)" for e in employees])
    
    cursor.execute('''
        INSERT INTO payroll_history (date_created, date_start, date_end, total_cost, details)
        VALUES (?, ?, ?, ?, ?)
    ''', (today, date_start, date_end, grand_total, details_str))
    
    conn.commit()
    conn.close()

    # --- Generates PDF ---
    pdf = PDF()
    pdf.add_page()
    pdf.set_font("Arial", size=10)
    
    pdf.cell(0, 10, f"Period: {date_start} to {date_end}", 0, 1)
    pdf.cell(0, 10, f"Created at: {today}", 0, 1)
    pdf.ln(5)

    # Table Headers
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(45, 10, "Employee", 1)
    pdf.cell(15, 10, "Days", 1)
    pdf.cell(20, 10, "Overtime", 1)
    pdf.cell(30, 10, "Total", 1)
    pdf.cell(30, 10, "Bank", 1)  
    pdf.cell(30, 10, "Cash", 1)  
    pdf.ln()

    # Table Rows
    pdf.set_font("Arial", size=10)
    for emp in employees:
        pdf.cell(45, 10, str(emp['name']), 1)
        pdf.cell(15, 10, str(emp['days']), 1)
        pdf.cell(20, 10, str(emp['overtime_hours']), 1)
        pdf.cell(30, 10, f"{emp['total_pay']:.2f}", 1)
        pdf.cell(30, 10, f"{emp['bank_pay']:.2f}", 1) 
        pdf.cell(30, 10, f"{emp['cash_pay']:.2f}", 1) 
        pdf.ln()

    # Grand total
    pdf.ln(5)
    pdf.set_font("Arial", 'B', 12)
    pdf.cell(0, 10, f"Grand Total Cost: {grand_total:.2f} EUR", 0, 1, 'R')

   # Save PDF temporarily
    pdf_filename = f"payroll_{date_start}.pdf"
    pdf.output(pdf_filename)

    # Save file to user
    try:
        return send_file(pdf_filename, as_attachment=True, download_name=pdf_filename)
    finally:
        pass

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)