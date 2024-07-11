# """
# * File: v103\src\pod.py
# * Project: Omni-datawarehouse-api-services
# * Author: Bizcloud Experts
# * Date: 2022-08-03
# * Confidential and Proprietary
# """
import os
import json
import requests
import logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

def handler(event, context):
    LOGGER.info("Event: %s", json.dumps(event))
    try :
        if "file_nbr" in event["query"]:
            num = event["query"]["file_nbr"]
            url = os.environ["pod_URL"]+os.environ["pod_key"]+'/'+num
        elif "house_bill_nbr" in event["query"]:
            num = event["query"]["house_bill_nbr"]
            url = os.environ["pod_URL"]+os.environ["pod_key"]+'/'+num+'/hawb'
        req = requests.get(url)
    except Exception as handler_error:
        logging.exception("HandlerError: %s", handler_error)
        raise HandlerError(json.dumps({"httpStatus": 501, "message": "Internal Error."})) from handler_error

    if req.json()["hcpod"]["File Number"] == "ERROR":
        raise WtPODApiError(json.dumps({"httpStatus": 400, "message": "World Track POD API Error."}))
    response = req.content
    LOGGER.info("Response: %s",response)
    return response

class HandlerError(Exception):
    pass
class WtPODApiError(Exception):
    pass
