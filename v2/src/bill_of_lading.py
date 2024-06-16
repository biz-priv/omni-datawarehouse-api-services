# """
# * File: v2\src\bill_of_lading.py
# * Project: Omni-datawarehouse-api-services
# * Author: Bizcloud Experts
# * Date: 2022-12-15
# * Confidential and Proprietary
# """
import os
import json
import requests
import logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)
from src.common import skip_execution_if

@skip_execution_if
def handler(event, context):
    LOGGER.info("Event: %s", json.dumps(event))
    try :
        if "file_nbr" in event["query"]:
            num = event["query"]["file_nbr"]
            url = os.environ["URL"]+os.environ["billOfLading_key"]+'/'+num
        elif "house_bill_nbr" in event["query"]:
            num = event["query"]["house_bill_nbr"]
            url = os.environ["URL"]+os.environ["billOfLading_key"]+'/'+num+'/hawb'
        url_response = requests.get(url)
    except Exception as handler_error:
        logging.exception("HandlerError: %s", handler_error)
        raise HandlerError(json.dumps({"httpStatus": 501, "message": "Internal Error."})) from handler_error

    if url_response.json()["hawb"]["File Number"] == "ERROR":
        raise WtBolApiError(json.dumps({"httpStatus": 400, "message": "World Track Bill of Lading API Error."}))
    response = url_response.content
    LOGGER.info("Response: %s", response)
    return response

class HandlerError(Exception):
    pass
class WtBolApiError(Exception):
    pass
