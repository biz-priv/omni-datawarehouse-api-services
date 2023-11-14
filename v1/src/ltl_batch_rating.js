module.exports.handler = async (event, context) => {
    const response = {
        statusCode: 200,
        body: JSON.stringify({
            message: "CSV file uploaded successfully!",
            input: event,
        }),
    };
    return response;
};
