const { schema } = require("../../src/shared/validation/index");
const { CUSTOMER_ENTITLEMENT_TABLE, TOKEN_VALIDATION_TABLE } = process.env;
const { queryMethod } = require("../../src/shared/dynamoDB/index");
const pagination = require('../../src/shared/utils/pagination');
const _ = require('lodash');

module.exports.handler = async (event, context, callback) => {
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
    let totalCount = 0;
    let page = _.get(event, 'queryStringParameters.page')
    let size = _.get(event, 'queryStringParameters.size')
    console.info("page :---------- +++ : ",page);
    console.info("size :---------- +++ : ",size);
    if (!customerID.error) {
      if (customerID.length) {
        const fetchShipmentList = await queryMethod({
          TableName: CUSTOMER_ENTITLEMENT_TABLE,
          IndexName: "CustomerIDindex",
          KeyConditionExpression: "CustomerID = :value",
          ExpressionAttributeValues: {
            ":value": customerID[0].CustomerID,
          }
        });
        if (fetchShipmentList.length) {
          totalCount = fetchShipmentList.length;
          const paginationResult = await getResponse(fetchShipmentList, totalCount, page, size, event);
          return callback(null, {statusCode: 200, body: JSON.stringify({ Items: paginationResult })})
        } else {
          return callback(null, {statusCode: 404, body: "Shipments don't exist"})
        }
      } else {
        return callback(null, {statusCode: 404, body: "Shipments don't exist"})
      }
    } else {
      console.error("Error : \n", customerID);
      return callback(null, {statusCode: 400, body: JSON.stringify(customerID)})
    }
  } catch (error) {
    console.error("Error : \n", error);
    return callback(null, {statusCode: 500, body: JSON.stringify(error)})
  }
};


async function getResponse(results, count, page, size, event) {
  let selfPageLink = "N/A";
  let host = "https://" + _.get(event, 'headers.Host', null);
  let path = _.get(event, 'path', null) + "?";
  selfPageLink = "page=" + page + "&size=" + size;
  let responseArrayName = "Items"
  var response = await pagination.createPagination(results, responseArrayName, host, path, page, size, count, selfPageLink);
  return response;
}