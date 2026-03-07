import os
import json
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata']

def get_service():
    creds = None
    # Token file stores the user's access and refresh tokens, and is
    # created automatically when the authorization flow completes for the first time.
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    return build('drive', 'v3', credentials=creds)

def create_folder(name):
    service = get_service()
    file_metadata = {
        'name': name,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    file = service.files().create(body=file_metadata, fields='id').execute()
    print(f'Folder Created: {name} (ID: {file.get("id")})')
    return file.get('id')

if __name__ == '__main__':
    # Names of folders to create
    folders = [
        "防災包專屬討論區",
        "研香室討論區",
        "樂乙無限創造概念區"
    ]
    
    ids = {}
    for folder_name in folders:
        folder_id = create_folder(folder_name)
        ids[folder_name] = folder_id
        
    # Save IDs for other scripts to use
    with open('drive_folder_ids.json', 'w', encoding='utf-8') as f:
        json.dump(ids, f, ensure_ascii=False, indent=4)
    print("All folders created. IDs saved to drive_folder_ids.json")
