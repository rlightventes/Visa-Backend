app.get(/^\/https?:\/\/(.*)$/, async (req, res) => {
    const fullUrl = req.url.slice(1);

    try {
        const response = await axios({
            method: "get",
            url: fullUrl,
            responseType: "stream"
        });

        let filename = fullUrl.split("/").pop().split("?")[0];

        // Agar extension missing ho to default PDF maan lo
        if (!/\.[a-zA-Z0-9]{2,5}$/.test(filename)) {
            filename += ".pdf";
        }

        res.setHeader(
            "Content-Type",
            response.headers["content-type"] || "application/pdf"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}"`
        );

        response.data.pipe(res);

    } catch (err) {
        console.error("Proxy fetch error:", err.response?.status, err.response?.data || err.message);

        res.status(502).json({
            success: false,
            message: "Failed to fetch resource"
        });
    }
});
