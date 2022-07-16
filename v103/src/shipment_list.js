const { send_response } = require("../../src/shared/response/index");
const { schema } = require("../../src/shared/validation/index");
const { CUSTOMER_ENTITLEMENT_TABLE, TOKEN_VALIDATION_TABLE } = process.env;
const { queryMethod } = require("../../src/shared/dynamoDB/index");

module.exports.handler = async (event) => {
  console.info("Event: \n", JSON.stringify(event));
  try {
    await schema.validateAsync(event);
    const customerID = await queryMethod({
      TableName: TOKEN_VALIDATION_TABLE,
      KeyConditionExpression: "CustomerID = :value1 AND ApiKey = :value2",
      ExpressionAttributeValues: {
        ":value1": event.pathParameters["customerID"],
        ":value2": event.headers["x-api-key"]
      },
    });
    if (!customerID.error) {
      if (customerID.length) {
        const fetchShipmentList = await queryMethod({
          TableName: CUSTOMER_ENTITLEMENT_TABLE,
          IndexName: "CustomerIDindex",
          KeyConditionExpression: "CustomerID = :value",
          ExpressionAttributeValues: {
            ":value": customerID[0].CustomerID,
          },
        });
        if (fetchShipmentList.length) {
          return send_response(200, { Items: fetchShipmentList });
        } else {
          return send_response(400, "Record Not Found");
        }
      } else {
        return send_response(400, "Record Not Found");
      }
    } else {
      console.error("Error : \n", customerID);
      return send_response(400, customerID);
    }
  } catch (error) {
    console.error("Error : \n", error);
    return send_response(400, error);
  }
};
