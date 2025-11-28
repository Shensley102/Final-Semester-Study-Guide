from flask import Flask, render_template, jsonify, request
import os
import json
from urllib.parse import unquote

app = Flask(__name__, 
            static_folder='../static',
            static_url_path='/static',
            template_folder='../template')

# Add CORS headers to all responses
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

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
            'HESI_Delegating',
            'HESI_Leadership',
            'Hesi_Management',
            'HESI_Comprehensive'
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
    """Return all modules from all categories"""
    all_modules = []
    for category_data in STUDY_CATEGORIES.values():
        all_modules.extend(category_data.get('modules', []))
    return sorted(list(set(all_modules)))


def find_category(category_name):
    """Find category by exact match (case-insensitive)"""
    if category_name in STUDY_CATEGORIES:
        return category_name
    
    for key in STUDY_CATEGORIES.keys():
        if key.lower() == category_name.lower():
            return key
    
    return None


# Routes
@app.route('/')
def home():
    """HOME PAGE"""
    return render_template('home.html')


@app.route('/category/<path:category>')
def category_page(category):
    """CATEGORY PAGE"""
    decoded_category = unquote(category)
    actual_category = find_category(decoded_category)
    
    if not actual_category:
        return jsonify({'error': 'Category not found'}), 404
    
    category_data = STUDY_CATEGORIES[actual_category]
    return render_template('category.html', category=actual_category, category_data=category_data)


@app.route('/quiz')
def quiz_page_no_module():
    """QUIZ PAGE - no specific module"""
    return render_template('quiz.html')


@app.route('/quiz/<module_name>')
def quiz_page(module_name):
    """QUIZ PAGE - specific module"""
    return render_template('quiz.html')


@app.route('/api/categories')
def get_categories():
    """API endpoint returning all categories"""
    return jsonify(STUDY_CATEGORIES), 200


@app.route('/api/category/<path:category>/modules')
def get_category_modules(category):
    """Return modules for a specific category"""
    decoded_category = unquote(category)
    actual_category = find_category(decoded_category)
    
    if not actual_category:
        return jsonify({'error': 'Category not found'}), 404
    
    category_data = STUDY_CATEGORIES[actual_category]
    modules = category_data.get('modules', [])
    return jsonify({'modules': modules, 'category': actual_category}), 200


@app.route('/modules', methods=['GET'])
def modules_list():
    """Return list of available modules"""
    try:
        modules = get_available_modules()
        return jsonify({'modules': modules}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/<module_name>.json', methods=['GET'])
def get_module(module_name):
    """Serve a specific module JSON file"""
    try:
        # Security check
        if not all(c.isalnum() or c in '_-' for c in module_name):
            return jsonify({'error': 'Invalid module name'}), 400
        
        # Get the base directory (go up from api folder)
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        file_path = os.path.join(base_dir, f'{module_name}.json')
        
        if not os.path.exists(file_path):
            return jsonify({'error': f'Module "{module_name}" not found'}), 404
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        return jsonify(data), 200
    
    except json.JSONDecodeError as e:
        return jsonify({'error': f'Invalid JSON: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Vercel serverless function handler
app.debug = False
