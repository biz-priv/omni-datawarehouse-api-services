import json
import os
import dicttoxml
import xmltodict
import requests
import logging
import pydash
from ast import literal_eval
from datetime import date
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

INTERNAL_ERROR_MESSAGE = "Internal Error."

def handler(event, context):
    print("Event is : ", event)
    
    rating_data = get_rating_input(event)
    commodity_data = get_commodity_input(event)
    
    start = """<?xml version="1.0" encoding="utf-8"?><soap12:Envelope \
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \
        xmlns:xsd="http://www.w3.org/2001/XMLSchema" \
            xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"> \
            <soap12:Body><GetRating xmlns="http://tempuri.org/"> \
            <RatingParam><RatingInput>"""
    mid = """</RatingInput><CommodityInput><CommodityInput>"""
    end = """</CommodityInput></CommodityInput></RatingParam></GetRating></soap12:Body></soap12:Envelope>"""
    payload = start+rating_data+mid+commodity_data+end
    
    try:
        url = "https://wttest.omnilogistics.com/WTKServices/getrating.asmx"
        req = requests.post(url, headers = {'Content-Type': 'text/xml; charset=utf-8'},data = payload)
        response = req.text
        return response
    except Exception as wt_error:
        LOGGER.exception("GetRatingApiError: %s", json.dumps(wt_error))
        raise GetRatingApiError(json.dumps({"httpStatus": 400, "message": "WorldTrack Get Rating Api Error"})) from wt_error

def get_rating_input(event):
    rating_data = {}
    for key in event["body"]["Rating Input"]:
        if type(event["body"]["Rating Input"][key]) is str:
            new_key = key.replace(" ", "")
            rating_data[new_key] = event["body"]["Rating Input"][key]
    rating_data=dicttoxml.dicttoxml(rating_data, attr_type=False,custom_root='soap:Body')
    rating_data = str(rating_data).\
                replace("""b'<?xml version="1.0" encoding="UTF-8" ?><soap:Body>""", """""").\
                replace("""</soap:Body>'""","""""")
    return rating_data

def get_commodity_input(event):
    commodity_data = {}
    for key in event["body"]["Commodity Input"]:
        if type(event["body"]["Commodity Input"][key]) is str:
            new_key = key.replace(" ", "")
            commodity_data[new_key] = event["body"]["Commodity Input"][key]
    commodity_data=dicttoxml.dicttoxml(commodity_data, attr_type=False,custom_root='soap:Body')
    commodity_data = str(commodity_data).\
                replace("""b'<?xml version="1.0" encoding="UTF-8" ?><soap:Body>""", """""").\
                replace("""</soap:Body>'""","""""")
    return commodity_data

class InputError(Exception):
    pass
class HandlerError(Exception):
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
