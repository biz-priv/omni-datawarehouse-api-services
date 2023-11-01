const AWS = require("aws-sdk");
const { Converter } = AWS.DynamoDB;
const dynamodb = new AWS.DynamoDB.DocumentClient();
const ddb = new AWS.DynamoDB.DocumentClient();
const { get } = require("lodash");

module.exports.handler = async (event) => {
  console.log("event: ", event);
  return {
    message: event,
  };
};
