# bill_of_lading function is not exist in v2024
# """
# * File: v202\src\bill_of_lading.py
# * Project: Omni-datawarehouse-api-services
# * Author: Bizcloud Experts
# * Date: 2023-10-06
# * Confidential and Proprietary
# """
import json
def handler(event, context):  # NOSONAR
    return json.dumps(
        {"httpStatus": 404, "message": "bill_of_lading function is not exist in v202"})