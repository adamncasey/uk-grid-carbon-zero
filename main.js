import { RAW_ENERGY_DATA, RAW_ENERGY_HEADERS } from './bmrs.js'
import {RAW_SOLAR_DATA} from './solar.js'
import { DateTime } from './luxon.min.js';

const COLOURS = {
    "ccgt": "rgba(224, 159, 125, 1.0)",
    "oil": "rgba(0, 0, 0, 0.8)",
    "coal": "rgba(72, 67, 73, 1.0)",
    "nuclear": "rgba(0, 0, 120, 0.8)",
    "wind": "rgba(16, 150, 72, 1.0)",
    "pumped_storage": "rgba(0, 120, 255, 0.8)",
    "hydro": "rgba(146, 213, 230, 1.0)",
    "ocgt": "rgba(50, 0, 0, 0.8)",
    "other": "rgba(0, 0, 0, 0.1)",
    "intfr": "rgba(179, 112, 176, 1.0)",
    "intirl": "rgba(179, 112, 176, 1.0)",
    "inted": "rgba(179, 112, 176, 1.0)",
    "intew": "rgba(179, 112, 176, 1.0)",
    "intnem": "rgba(179, 112, 176, 1.0)",
    "intelec": "rgba(179, 112, 176, 1.0)",
    "intifa2": "rgba(179, 112, 176, 1.0)",
    "intnsl": "rgba(179, 112, 176, 1.0)",
    "solar": "rgba(249, 215, 28, 1.0)",
}

function daily_power_summary(data, h, output_data, period_summary, options) {
    let seen_dates = {};
    let dates = [];
    let summary_data = {};
    for (let header in h) {
        summary_data[header] = [];
    }

    console.log(options);

    for (let datapoint of data) {
        let date = datapoint[0];

        if (!seen_dates.hasOwnProperty(date)) {
            seen_dates[date] = dates.length;
            dates.push(date);
        }

        let dateIndex = seen_dates[date];

        // Calculate total demand pre-scaling

        // TODO: Option to treat interconnects as high carbon?
        const carbon_order = [
            "solar",
            "wind",
            "hydro",
            "nuclear",
            "pumped_storage",
            "biomass",
            "other",
            "intfr",
            "intirl",
            "inted",
            "intew",
            "intnem",
            "intelec",
            "intifa2",
            "intnsl",
            "ccgt",
            "oil",
            "ocgt",
            "coal",
        ];

        let remaining_demand = datapoint[h["demand"]];

        if (isNaN(remaining_demand)) {
            console.log(remaining_demand, datapoint);
        }

        for (let supply of carbon_order) {
            let value = datapoint[h[supply]] || 0;
            if (supply == "solar") {
                value *= options.scale_solar;
            } else if (supply == "wind") {
                value *= options.scale_wind;
            }

            if (value < remaining_demand) {
                remaining_demand -= value;
            } else {
                value = remaining_demand;
                remaining_demand = 0;
            }

            let day = summary_data[supply][dateIndex] || 0;
            day += value;

            summary_data[supply][dateIndex] = day;
        }
    }

    let index = 0;
    for(let header in summary_data) {
        if (!output_data.hasOwnProperty(header)) {
            output_data[header] = [];
        }
        period_summary[index] = 0;

        for(let date in summary_data[header]) {
            let y = summary_data[header][date] / 48; // 30min periods

            let yyyymmdd = dates[date];
            let x = new Date(Date.UTC(Math.floor(yyyymmdd / 10000), Math.floor(yyyymmdd % 10000 / 100) - 1, Math.floor(yyyymmdd % 100)));
            output_data[header][date] = {x, y};

            period_summary[index] += y;
        }

        index += 1;
    }
}

function combine_solar_and_bmrs(solar, bmrs_data, bmrs_headers) {
    for (let datapoint of solar) {
        // Parse time & convert to BST
        let datetime = DateTime.fromISO(datapoint[1]).setZone("Europe/London");

        // Convert to yyyymmdd + period
        let yyyymmdd = datetime.year * 10000 + datetime.month * 100 + datetime.day;
        let period = (datetime.hour * 2) + ((datetime.minute >= 30) ? 1 : 0);

        // Find bmrs_data entry for this time
        for (let bmrs_dp of bmrs_data) {
            if (bmrs_dp[0] == yyyymmdd && bmrs_dp[1] == period) {
                bmrs_dp.push(datapoint[3]);
            }
        }
    }

    console.log(bmrs_data);

    let headers = structuredClone(bmrs_headers);
    headers["solar"] = 20;

    console.log(headers);
    for(let datapoint of bmrs_data) {
        let demand = 0;
        
        for (let header in headers) {
            demand += (datapoint[headers[header]] || 0);
        }
        // Ensure solar datapoint exists
        if (datapoint.length != 21) {
            datapoint.push(0);
        }
        datapoint.push(demand);
    }
    headers["demand"] = 21;

    return [bmrs_data, headers];
}

let combined_data = [];
let combined_headers = [];
let summary_data = {};
let period_summary_data = [];

let chart_obj = null;
let period_summary_pie = null;

export function recalculate_data() {
    let options = {
        scale_solar: parseFloat(document.getElementById("scale_solar").value),
        scale_wind: parseFloat(document.getElementById("scale_wind").value),
    };

    document.getElementById("scale_wind_display").innerText = options.scale_wind;
    document.getElementById("scale_solar_display").innerText = options.scale_solar;

    daily_power_summary(combined_data, combined_headers, summary_data, period_summary_data, options);

    if (chart_obj) chart_obj.update();
    if (period_summary_pie) period_summary_pie.update();
}

export function main() {
    let bmrs_data = RAW_ENERGY_DATA();
    let bmrs_headers = RAW_ENERGY_HEADERS();
    let solar = RAW_SOLAR_DATA();

    [combined_data, combined_headers] = combine_solar_and_bmrs(solar, bmrs_data, bmrs_headers);

    recalculate_data();

    const ctx = document.getElementById('myChart').getContext('2d');

    let datasets = [];
    for (let header in combined_headers) {
        if (header == "demand") {
            continue;
        }
        datasets.push({
            label: header,
            data: summary_data[header],
            borderWidth: 1,
            borderColor: COLOURS[header],
            backgroundColor: COLOURS[header],
            fill: true,
        });
    }

    console.log(datasets);

    chart_obj = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: datasets,
        },
        options: {
            scales: {
                y: {
                    stacked: true,
                    title: {
                        text: "Energy Demand in MW"
                    }
                },
                x: {
                    type: 'time',
                    time: {
                        unit: 'month'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text:"Power sources per day",
                },
            }
        }
    });

    const pie_ctx = document.getElementById("summary_chart").getContext("2d");

    let labels = [];
    let data = [];
    let colours = [];
    for (let header in combined_headers) {
        labels.push(header);
        colours.push(COLOURS[header]);
    }

    let pie_data = {
        labels: labels,
        datasets: [{
            label: "Power sources over the whole period",
            data: period_summary_data,
            backgroundColor: colours,
        }]
    }

    period_summary_pie = new Chart(pie_ctx, {
        type: 'doughnut',
        data: pie_data,
        options: {
            plugins: {
                title: {
                    display: true,
                    text:"Where our energy came from over the whole period",
                },
                legend: {
                    display: false,
                },
            },
            maintainAspectRatio: false,
        }
    });


    document.getElementById("scale_wind").onchange = () => recalculate_data();
    document.getElementById("scale_solar").onchange = () => recalculate_data();
}