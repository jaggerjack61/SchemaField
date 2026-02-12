import requests

BASE_URL = 'http://127.0.0.1:8000/api'

def log(msg, success=True):
    icon = "✅" if success else "❌"
    print(f"{icon} {msg}")

def test_share_features():
    print("Testing Share ID & QR Code Features...")
    
    # 1. Create Form
    form_data = {
        "title": "Share Test Form",
        "sections": [
            {
                "title": "Section 1",
                "questions": [
                    {"text": "Your name?", "question_type": "short_text", "order": 0}
                ]
            }
        ]
    }
    
    try:
        response = requests.post(f"{BASE_URL}/forms/", json=form_data)
        if response.status_code != 201:
            log(f"Create Form Failed: {response.text}", False)
            return
        
        data = response.json()
        form_id = data['id']
        share_id = data.get('share_id')
        qr_code = data.get('qr_code')
        
        # Verify share_id is a UUID
        if share_id and len(share_id) == 36 and '-' in share_id:
            log(f"Share ID generated: {share_id}")
        else:
            log(f"Share ID not generated properly: {share_id}", False)
            
        # Verify QR code exists
        if qr_code and 'qrcodes/' in qr_code:
            log(f"QR Code generated: {qr_code}")
        else:
            log(f"QR Code not generated: {qr_code}", False)
        
        # 2. Look up by share_id
        response = requests.get(f"{BASE_URL}/forms/by-share-id/{share_id}/")
        if response.status_code == 200:
            fetched = response.json()
            if fetched['id'] == form_id:
                log(f"Lookup by share_id: Success (found form {form_id})")
            else:
                log(f"Lookup returned wrong form", False)
        else:
            log(f"Lookup by share_id Failed: {response.status_code} {response.text}", False)
        
        # 3. Verify share_id appears in list endpoint
        response = requests.get(f"{BASE_URL}/forms/")
        forms_list = response.json()
        test_form = next((f for f in forms_list if f['id'] == form_id), None)
        if test_form and test_form.get('share_id') == share_id:
            log("Share ID in list endpoint: Success")
        else:
            log("Share ID not in list endpoint", False)
        
        # Cleanup
        requests.delete(f"{BASE_URL}/forms/{form_id}/")
        log("Cleanup: Done")
        
    except Exception as e:
        log(f"Exception: {e}", False)

if __name__ == "__main__":
    test_share_features()
