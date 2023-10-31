




module.exports.handler = async (event, context, callback) => {
    console.info("event", JSON.stringify(event));

    return {
        message: event
    }

}