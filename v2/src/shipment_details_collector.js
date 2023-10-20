const AWS = require('aws-sdk');
const { Converter } = AWS.DynamoDB;










module.exports.handler = async (event) => {
    console.log("event: ", event)

    const unmarshalledData = Converter.unmarshall(event.Records[0].dynamodb.NewImage);

    console.log(unmarshalledData)

    return{
        message: event
    };
}