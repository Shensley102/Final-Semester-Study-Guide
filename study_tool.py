from flask import Flask, render_template, jsonify, send_from_directory
import os
import json

app = Flask(__name__, static_folder='static', template_folder='template')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODULES_DIR = BASE_DIR

# Study categories and their modules
STUDY_CATEGORIES = {
    'Patient Care Management': {
        'display_name': 'Patient Care Management',
        'icon': '👥',
        'modules': [
            'Module_1',
            'Module_2',
            'Module_3',
            'Module_4',
            'Learning_Questions_Module_1_2',
            'Learning_Questions_Module_3_4'
        ]
    },
    'HESI': {
        'display_name': 'HESI',
        'icon': '📋',
        'modules': [
            'Hesi_Management'
        ]
    },
    'Nursing Certifications': {
        'display_name': 'Nursing Certifications',
        'icon': '🏆',
        'modules': [
            'CCRN_Test_1_Combined_QA',
            'CCRN_Test_2_Combined_QA',
            'CCRN_Test_3_Combined_QA'
        ]
    },
    'Pharmacology': {
        'display_name': 'Pharmacology',
        'icon': '💊',
        'modules': [
            'Pharm_Quiz_1',
            'Pharm_Quiz_2',
            'Pharm_Quiz_3',
            'Pharm_Quiz_4'
        ]
    }
}


def get_available_modules():
    """Scan for all .json files in the modules directory"""
    modules = []
    try:
        for filename in os.listdir(MODULES_DIR):
            if filename.endswith('.json') and filename not in ['vercel.json']:
                module_name = filename[:-5]
                modules.append(module_name)
        modules.sort()
    except Exception as e:
        print(f"Error scanning modules: {e}")
    return modules


# Routes
@app.route('/')
def home():
    """HOME PAGE - Nurse Success Study Hub"""
    return render_template('home.html')


@app.route('/category/<category>')
def category_page(category):
    """CATEGORY PAGE - Shows all quizzes in a category"""
    category_data = STUDY_CATEGORIES.get(category)
    if not category_data:
        return jsonify({'error': 'Category not found'}), 404
    
    return render_template('category.html', category=category, category_data=category_data)


@app.route('/quiz/<module_name>')
def quiz_page(module_name):
    """QUIZ PAGE - The actual quiz application"""
    return render_template('quiz.html')


@app.route('/api/categories')
def get_categories():
    """API endpoint returning all categories"""
    return jsonify(STUDY_CATEGORIES), 200


@app.route('/modules', methods=['GET'])
def modules_list():
    """Return list of available modules as JSON"""
    try:
        modules = get_available_modules()
        return jsonify({'modules': modules}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/<module_name>.json', methods=['GET'])
def get_module(module_name):
    """
    Serve a specific module JSON file.
    Prevents directory traversal by validating the module name.
    """
    try:
        # Security: only allow alphanumeric, underscore, hyphen
        if not all(c.isalnum() or c in '_-' for c in module_name):
            return jsonify({'error': 'Invalid module name'}), 400
        
        file_path = os.path.join(MODULES_DIR, f'{module_name}.json')
        
        # Verify the file exists and is in the correct directory
        if not os.path.exists(file_path):
            return jsonify({'error': f'Module "{module_name}" not found'}), 404
        
        # Prevent directory traversal
        real_path = os.path.realpath(file_path)
        real_base = os.path.realpath(MODULES_DIR)
        if not real_path.startswith(real_base):
            return jsonify({'error': 'Invalid module path'}), 403
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        return jsonify(data), 200
    
    except json.JSONDecodeError as e:
        return jsonify({'error': f'Invalid JSON in module: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def internal_error(e):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
