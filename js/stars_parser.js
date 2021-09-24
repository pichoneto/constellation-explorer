const fs = require('fs');
const got = require('got');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const constellationLines = {};
const hdToHr = {};
const constellationAbbreviations = ["And", "Ant", "Aps", "Aqr", "Aql", "Ara", "Ari", "Aur", "Boo", "Cae", "Cam", "Cnc", 
        "CVn", "CMa", "CMi", "Cap", "Car", "Cas", "Cen", "Cep", "Cet", "Cha", "Cir", "Col", "Com", "CrA", 
        "CrB", "Crv", "Crt", "Cru", "Cyg", "Del", "Dor", "Dra", "Equ", "Eri", "For", "Gem", "Gru", "Her", 
        "Hor", "Hya", "Hyi", "Ind", "Lac", "Leo", "LMi", "Lep", "Lib", "Lup", "Lyn", "Lyr", "Men", "Mic", 
        "Mon", "Mus", "Nor", "Oct", "Oph", "Ori", "Pav", "Peg", "Per", "Phe", "Pic", "Psc", "PsA", "Pup", 
        "Pyx", "Ret", "Sge", "Sgr", "Sco", "Scl", "Sct", "Ser", "Sex", "Tau", "Tel", "Tri", "TrA", "Tuc", 
        "UMa", "UMi", "Vel", "Vir", "Vol", "Vul"];

const parseBSC = () => {
    const bsc = JSON.parse(fs.readFileSync("./json/bsc5.json", {encoding: "UTF8"}));
    bsc.map(star => hdToHr[parseInt(star.HD)] = parseInt(star.HR));
    console.log("Read " + Object.keys(hdToHr).length + " from BSC");
}

const parseConstellationLines = () => {
    const lines = fs.readFileSync("./json/constellations.txt", {encoding: "UTF8"}).split("\n");
    lines.map(line => {
        const values = line.split("\t");
        const hrA = parseInt(values[1]);
        const hrB = parseInt(values[7]);
        if(!constellationLines[hrA]) {
            constellationLines[hrA] = [];
        }
        constellationLines[hrA].push(hrB);    
    });
    console.log("Read " + lines.length + " constellation lines");
}

const getConstellations = () => {
    const constellationsUrl = `https://en.wikipedia.org/wiki/Lists_of_stars_by_constellation`;

    return new Promise((resolve, reject) => {
        got(constellationsUrl).then(response => {
            const dom = new JSDOM(response.body);
            const constellationsList = Array.from(
                dom.window.document.querySelectorAll(".multicol > tbody > tr > td > ul > li")
            ).map(c => c.textContent);

            Promise.all(constellationsList.map((c, i) => getConstellation(c, i))).then(result => {
                const stars = {};
                let totalRejected = 0;
                let totalFound = 0;
                let minMag = 0;
                let maxMag = 0;
                let minDist = Number.MAX_VALUE;
                let maxDist = 0;
                let totalWithoutDistance = 0;
                const constellations = result.map(constellation => {
                    let rejected = 0;
                    constellation.stars = constellation.stars.map(star => {
                        const hr = hdToHr[star.hd];
                        if(hr) {
                            stars[hr] = {
                                constellation: constellation.name,
                                name: star.name,
                                ra: star.ra,
                                dec: star.dec,
                                vis_mag: star.vis_mag,
                                dist: star.dist,
                                class: star.class,
                                hd: star.hd,
                                hr: hr,
                                connectsTo: constellationLines[hr]
                            };
                            if(!isNaN(star.dist)) {
                                minMag = Math.max(minMag, star.vis_mag);
                                maxMag = Math.min(maxMag, star.vis_mag);
                                minDist = Math.min(minDist, star.dist);
                                maxDist = Math.max(maxDist, star.dist);
                            } else {
                                totalWithoutDistance++;
                            }
                        } else {
                            rejected++;
                        }
                        return hr;
                    }).filter(v => !!v);
                    console.log("Rejected " + rejected + " stars in " + constellation.name + "\n");
                    totalRejected += rejected;
                    totalFound += constellation.total;
                    constellation.total = constellation.stars.length;
                    return constellation;
                });
                console.log(`Total found: ${totalFound}. Total rejected: ${totalRejected}. Total added: ${totalFound - totalRejected}. MinDist: ${minDist}, maxDist: ${maxDist}, no distance: ${totalWithoutDistance}, minMag: ${minMag}, maxMag: ${maxMag}`);
                fs.writeFile("./json/stars.json", JSON.stringify({stars, constellations, minMag, maxMag, minDist, maxDist}), {encoding: "UTF-8"}, () => {});
            });
        }).catch(err => {
            reject(err)
        });
    });
}

const gouldingConstellations = [
    "Aquarius",
    "Aquila",
    "Boötes",
    "Cetus",
    "Eridanus",
    "Hercules",
    "Hydra",
    "Leo",
    "Ophiuchus",
    "Pegasus",
    "Pisces",
    "Puppis",
    "Sagittarius",
    "Serpens",
    "Taurus",
    "Virgo"
]

const onlyBayerConstellations = [
    "Antlia",
    "Apus",
    "Ara",
    "Carina",
    "Chamaeleon",
    "Circinus",
    "Columba",
    "Corona Australis",
    "Crux",
    "Dorado",
    "Fornax",
    "Grus",
    "Horologium",
    "Hydrus",
    "Indus",
    "Microscopium",
    "Mensa",
    "Musca",
    "Norma",
    "Octans",
    "Pavo",
    "Phoenix",
    "Pictor",
    "Pyxis",
    "Reticulum",
    "Scutum",
    "Sculptor",
    "Telescopium",
    "Triangulum Australe",
    "Tucana",
    "Vela"
]

const parseBoundary = data => data.split("\n").map(line => {
    if(line.trim()) {
        const values = line.split("|");
        const raValues = values[0].split(" ");
        const ra = 15 * parseInt(raValues[0]) + 15 * parseInt(raValues[1]) / 60 + 15 * parseFloat(raValues[2]) / 3600;
        const dec = parseFloat(values[1].trim());
        const adjustedDec = dec < 0 ?  90 - dec : dec - 90;
        const adjustedRa = dec < 0 ? ra : ra + 180;
        return {ra: adjustedRa, dec: adjustedDec};
    }
}).filter(v => !!v);

const getConstellation = (name, index) => {
    const constellationUrl = `https://en.wikipedia.org/wiki/List_of_stars_in_${name}`;

    return new Promise((resolve, reject) => {
        got(constellationUrl).then(response => {
            const dom = new JSDOM(response.body.replace(/−/g, "-").replace(/\n/g, ""));
            const stars = Array.from(dom.window.document.querySelectorAll(".wikitable > tbody > tr"))
                .filter((val, index) => index !== 0 && val.textContent.indexOf("Table legend") === -1)
                .map(row => {
                    const starData = Array.from(row.cells).map(data => data.textContent);
                    return gouldingConstellations.indexOf(name) !== -1 ? 
                        formatGoulding(starData) : onlyBayerConstellations.indexOf(name) !== -1 ? 
                            formatBayer(starData) : formatStar(starData);
                })
                .filter(s => s.vis_mag < 6.0)
            // .filter(s => !!s.dist);
            console.log("Downloaded " + name + ". " + stars.length + " found.");

            stars.map(star => {
                if(!star.dist) {
                    for(let i = 0; i < stars.length; i++) {
                        if(star.bayer === stars[i].bayer || star.flamsteed === stars[i].flamsteed) {
                            star.dist = stars[i].dist;
                            break;
                        }
                    }
                    if(!star.dist) {
                        console.log("No distance for " + star.name + " " + star.hd);
                    }
                }
            })

            const abbreviation = name !== "Serpens" ? constellationAbbreviations[index].toLowerCase() : "ser1";
            const boundaryUrl = `https://www.iau.org/static/public/constellations/txt/${abbreviation}.txt`;
            got(boundaryUrl).then(response => {
                console.log("Downloaded boundary for " + name);
                const boundary = parseBoundary(response.body);

                resolve({
                    name,
                    stars,
                    total: stars.length,
                    boundary
                });
            }).catch(err => {
                console.log("Failed boundary for " + name);
                reject(err)
            });
            
        }).catch(err => {
            reject(err)
        });
    });
}

const formatStar = (data) => ({
    name: data[0],
    bayer: data[1],
    flamsteed: parseInt(data[2]) || "N/A",
    variable: data[3],
    hd: parseInt(data[4]),
    hip: parseInt(data[5]),
    ra: data[6],
    dec: data[7],
    vis_mag: parseFloat(data[8]),
    abs_mag: parseFloat(data[9]),
    dist: parseFloat(/(\d+\.*\d*)/.exec(data[10].replace(",", ""))),
    class: data[11],
    notes: data[12],
})

const formatGoulding = (data) => ({
    name: data[0],
    bayer: data[1],
    flamsteed: parseInt(data[2]),
    gould: parseInt(data[3]),
    variable: data[4],
    hd: parseInt(data[5]),
    hip: parseInt(data[6]),
    ra: data[7],
    dec: data[8],
    vis_mag: parseFloat(data[9]),
    abs_mag: parseFloat(data[10]),
    dist: parseFloat(/(\d+\.*\d*)/.exec(data[11].replace(",", ""))),
    class: data[12],
    notes: data[13],
})

const formatBayer = (data) => ({
    name: data[0],
    bayer: data[1],
    variable: data[2],
    hd: parseInt(data[3]),
    hip: parseInt(data[4]),
    ra: data[5],
    dec: data[6],
    vis_mag: parseFloat(data[7]),
    abs_mag: parseFloat(data[8]),
    dist: parseFloat(/(\d+\.*\d*)/.exec(data[9].replace(",", ""))),
    class: data[10],
    notes: data[11],
})


parseBSC();
parseConstellationLines();
getConstellations();

// getConstellation("Antlia", 1)