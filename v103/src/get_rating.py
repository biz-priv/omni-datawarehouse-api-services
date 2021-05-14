import json
import os
import dicttoxml
import xmltodict
import requests
import logging
from ast import literal_eval
from datetime import date
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

INTERNAL_ERROR_MESSAGE = "Internal Error."

def handler(event, context):
    LOGGER.info("Event: %s", json.dumps(event))
    
    start = """<?xml version="1.0" encoding="utf-8"?><soap12:Envelope \
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \
        xmlns:xsd="http://www.w3.org/2001/XMLSchema" \
            xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body> \
    <GetRating xmlns="http://tempuri.org/">\
      <RatingParam><RatingInput>"""
    rating_input = """"""
    commodity_input = """"""
    mid = """</RatingInput><CommodityInput><CommodityInput>"""
    end = """</CommodityInput></CommodityInput></RatingParam></GetRating></soap12:Body></soap12:Envelope>"""
    payload = start+rating_input+mid+commodity_input+end
    LOGGER.info("Payload xml data is : %s", json.dumps(payload))

    try:
        url = "https://wttest.omnilogistics.com/WTKServices/getrating.asmx"
    except Exception as url_error:
        LOGGER.exception("Environment variable URL not set.")
        raise EnvironmentVariableError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from url_error
    try:
        req = requests.post(url, headers = {'Content-Type': 'text/xml; charset=utf-8'},data = payload)
        response = req.text
        LOGGER.info("Response is : %s", json.dumps(response))
    except Exception as wt_error:
        LOGGER.exception("GetRatingApiError: %s", json.dumps(wt_error))
        raise GetRatingApiError(json.dumps({"httpStatus": 400, "message": "WorldTrack Get Rating Api Error"})) from wt_error

def modify_object_keys(array):
    new_array = []
    for obj in array:
        new_obj = {}
        for key in obj:
            new_key = key.replace(" ","")
            new_obj[new_key] = obj[key]
        new_array.append(new_obj)
    return new_array

def validate_input(event):
    if not "enhancedAuthContext" in event or "customerId" not in event["enhancedAuthContext"]:
        raise InputError(json.dumps({"httpStatus": 400, "message": "CustomerId not found."}))
    client_data = ['Service Level','Ready Date']
    if not "body" in event or not "oShipData" in event["body"] or not set(client_data).issubset(event["body"]["oShipData"]):
        raise InputError(json.dumps({"httpStatus": 400, "message": "One/All of: Service Level, Ready Date parameters are missing in the request body oShipData."}))
    return event["enhancedAuthContext"]["customerId"]

class InputError(Exception):
    pass
class HandlerError(Exception):
    pass
class GetShipmentLineListError(Exception):
    pass
class GetReferenceListError(Exception):
    pass
class GetAccessorialListError(Exception):
    pass
class WtBolApiError(Exception):
    pass
class DataTransformError(Exception):
    pass
class EnvironmentVariableError(Exception):
    pass
class AirtrakShipmentApiError(Exception):
    pass
class GetServiceLevelError(Exception):
    pass
class ReadyDateTimeError(Exception):
    pass
