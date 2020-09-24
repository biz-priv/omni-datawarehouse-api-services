import requests
from requests.auth import HTTPBasicAuth
import logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)
import os

def handler(event, context):
    try :
        print("Event is this : " , event)
        file_nbr = event.get("query")['file_nbr']
        bill_key = os.environ['billOfLading_key']
        
        url = 'https://websli.omnilogistics.com/wtTest/gethawb/v1/json/'+bill_key+'/'+file_nbr
        print(url)
        r = requests.get(url)
        response = r.content
        print("Content Response is : ", response)
        return response

    except error as e:
        raise error({"Error": True,"message":str(e)})
        
class error(Exception):
    def __init___(self, message):
        Exception.__init__(self, "error : {}".format(message))
        self.message = message
        #Python inbuilt error class to change the error into stack format
