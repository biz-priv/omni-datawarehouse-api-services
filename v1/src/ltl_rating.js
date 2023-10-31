module.exports.handler = async (event, context) => {
    console.log(`🙂 -> file: ltl_rating.js:2 -> event:`, event);
    const response = {
        statusCode: 200,
        body: JSON.stringify({ hello: "world" }),
    };
    return response;
};
