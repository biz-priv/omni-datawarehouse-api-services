import os
import json
import requests
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    logger.info("Event: {}".format(json.dumps(event)))
    try :
        if "file_nbr" in event["query"]:
            num = event["query"]["file_nbr"]
        elif "house_bill_nbr" in event["query"]:
            num = event["query"]["house_bill_nbr"]
        
        url = os.environ["URL"]+os.environ["billOfLading_key"]+'/'+num
        logger.info("URL: {}".format(url))
        r = requests.get(url)
        logger.info("R: {}".format(r.json()))
    except Exception as e:
        logging.exception("HandlerError: {}".format(e))
        raise HandlerError(json.dumps({"httpStatus": 501, "message": "Internal Error."}))
    
    if(r.json()["hawb"]["File Number"] == "ERROR"):
        raise WtBolApiError(json.dumps({"httpStatus": 400, "message": "World Track Bill of Lading API Error."}))
    response = r.content
    logger.info("Response: {}".format(response))
    logger.info("Content Response: {}".format(response))
    return response
        
class HandlerError(Exception): pass
class WtBolApiError(Exception): pass
