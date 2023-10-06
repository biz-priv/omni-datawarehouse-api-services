# shipment_create function is not exist in v202
import json
def handler(event, context):  # NOSONAR
    return json.dumps(
        {"httpStatus": 404, "message": "shipment_create function is not exist in v202"})