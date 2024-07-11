/*
* File: src\shared\dynamoDB\index.js
* Project: Omni-datawarehouse-api-services
* Author: Bizcloud Experts
* Date: 2022-07-16
* Confidential and Proprietary
*/
const AWS = require("aws-sdk");
let documentClient = new AWS.DynamoDB.DocumentClient({
  region: process.env.DEFAULT_AWS,
});

 async function dbRead(params) {
  try {
    let result = await documentClient.query(params).promise();
    let data = result.Items;
    if (result.LastEvaluatedKey) {
      params.ExclusiveStartKey = result.LastEvaluatedKey;
      data = data.concat(await dbRead(params));
    }
    return data;
  } catch (error) {
    console.info("Error In DbRead()", error);
    return {"error": error};
  }
}

 async function queryMethod(params) { 
    try {
      let data = await dbRead(params);
      console.info("QUERY RESP :", data);
      return data
    } catch (err) {
      return {"error": err}
    }
 }



module.exports = { queryMethod }