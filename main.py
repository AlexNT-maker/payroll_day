import sqlite3
import os
import sys
from flask import Flask, render_template, jsonify, request, send_file
from flask_cors import CORS
from fpdf import FPDF
import webbrowser
from threading import Timer
import datetime

# --- ΕΙΔΙΚΗ ΡΥΘΜΙΣΗ ΓΙΑ .EXE ---
if getattr(sys, 'frozen', False):
    # Αν τρέχει ως .exe, βρες τον φάκελο που αποσυμπιέστηκε
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    # Αν τρέχει κανονικά ως python script
    app = Flask(__name__)

CORS(app)

# Enable Cross origin resource sharing. 
CORS(app)

# Database configuration
DB_NAME = "payroll.db"

# --- PDF CLASS CONFIGURATION ---
class PDF(FPDF):
    def header(self):
        self.set_font('DejaVu', '', 14)
        self.cell(0, 10, 'Paraponiaris Bros - Payroll Report', 0, 1, 'C')
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font('DejaVu', '', 8)
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
    try:
        data = request.json
        date_start = data.get('date_start')
        date_end = data.get('date_end')
        employees = data.get('employees')
        
        grand_total = sum(emp['total_pay'] for emp in employees)

        conn = get_db_connection()
        cursor = conn.cursor()
        today = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        details_str = "\n".join([f"{e['name']}: Total {e['total_pay']}€ (Bank: {e['bank_pay']}€ | Cash: {e['cash_pay']}€)" for e in employees])
        
        cursor.execute('''
            INSERT INTO payroll_history (date_created, date_start, date_end, total_cost, details)
            VALUES (?, ?, ?, ?, ?)
        ''', (today, date_start, date_end, grand_total, details_str))
        
        conn.commit()
        conn.close()

        # --- Create PDF ---
        pdf = PDF()
        
        # Font path
        if getattr(sys, 'frozen', False):
            base_dir = sys._MEIPASS
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
        font_path = os.path.join(base_dir, 'static', 'DejaVuSans.ttf')

        if not os.path.exists(font_path):
            raise FileNotFoundError(f"ΤΟ ΑΡΧΕΙΟ ΔΕΝ ΒΡΕΘΗΚΕ ΕΔΩ: {font_path}")

        pdf.add_font('DejaVu', '', font_path, uni=True)
        pdf.add_page()
        pdf.set_font("DejaVu", size=10)
        
        # PDF content
        pdf.cell(0, 10, f"Period: {date_start} to {date_end}", 0, 1)
        pdf.cell(0, 10, f"Created at: {today}", 0, 1)
        pdf.ln(5)

        # Headers
        pdf.set_font("DejaVu", '', 10)
        pdf.cell(45, 10, "Employee", 1)
        pdf.cell(15, 10, "Days", 1)
        pdf.cell(20, 10, "Overtime", 1)
        pdf.cell(30, 10, "Total", 1)
        pdf.cell(30, 10, "Bank", 1)  
        pdf.cell(30, 10, "Cash", 1)  
        pdf.ln()

        # Rows
        pdf.set_font("DejaVu", size=10)
        for emp in employees:
            pdf.cell(45, 10, str(emp['name']), 1)
            pdf.cell(15, 10, str(emp['days']), 1)
            pdf.cell(20, 10, str(emp['overtime_hours']), 1)
            pdf.cell(30, 10, f"{emp['total_pay']:.2f}", 1)
            pdf.cell(30, 10, f"{emp['bank_pay']:.2f}", 1) 
            pdf.cell(30, 10, f"{emp['cash_pay']:.2f}", 1) 
            pdf.ln()

        pdf.ln(5)
        pdf.set_font("DejaVu", '', 12)
        pdf.cell(0, 10, f"Grand Total Cost: {grand_total:.2f} EUR", 0, 1, 'R')

      
        filename_only = f"payroll_{date_start}.pdf"
        full_save_path = os.path.join(os.getcwd(), filename_only)
        
        pdf.output(full_save_path)

        return send_file(full_save_path, as_attachment=True, download_name=filename_only)

    except Exception as e:
        # A text file to write the error
        with open("error_log.txt", "w", encoding="utf-8") as f:
            f.write(f"ΣΦΑΛΜΑ: {str(e)}\n")
            import traceback
            f.write(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

def open_browser():
    # Auto webbrowser open for .exe
    webbrowser.open_new("http://127.0.0.1:5000")

if __name__ == '__main__':
    init_db()
    
    # 1 second wait before autostart
    Timer(1, open_browser).start()
    
    
    app.run(debug=False, port=5000) 
