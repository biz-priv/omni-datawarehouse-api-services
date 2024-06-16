"""
* File: dev\src\custom_authorizer.py
* Project: Omni-datawarehouse-api-services
* Author: Bizcloud Experts
* Date: 2021-04-21
* Confidential and Proprietary
"""
import json
import logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

def handler(event):
    LOGGER.info("Event: %s", json.dumps(event))
    success_message = {"message": "Successfully Executed"}
    return success_message
