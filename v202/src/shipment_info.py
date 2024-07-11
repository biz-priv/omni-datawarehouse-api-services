# shipment_info function is not exist in v202
# """
# * File: v202\src\shipment_info.py
# * Project: Omni-datawarehouse-api-services
# * Author: Bizcloud Experts
# * Date: 2023-10-06
# * Confidential and Proprietary
# """
import json
def handler(event, context):  # NOSONAR
    return json.dumps(
        {"httpStatus": 404, "message": "shipment_info function is not exist in v202"})