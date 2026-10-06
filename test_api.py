import os
import json
import urllib.request
from urllib.parse import quote, urlencode
from dotenv import load_dotenv
load_dotenv('backend/.env')
api_key = os.getenv('GEMMA_API_KEY')
model = os.getenv('GEMMA_MODEL', 'gemma-3-27b-it')
endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'.format(model=quote(model, safe='-._'))
url = f'{endpoint}?{urlencode({"key": api_key})}'
body = json.dumps({'contents': [{'parts': [{'text': 'test'}]}]}).encode('utf-8')
req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode())
except urllib.error.HTTPError as e:
    print('HTTPError:', e.code, e.read().decode())
