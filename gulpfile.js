/**
 * Settings
 * Turn on/off build features
 */

var settings = {
	clean: true,
	scripts: true,
	polyfills: true,
	styles: true,
	svgs: true,
	copy: true,
	typescript: true,
	reload: true
};


var websites = null; // Websites available
var site = null; // Name of the website
var workspace = null; // Folder of the workspace
var jsTasks = null; // Repeated JavaScript tasks
var paths = null; // Paths related to workspace


/**
 * Template for banner to add to file headers
 */

var banner = {
	main:
		'/*!' +
		' <%= package.name %> v<%= package.version %>' +
		' | (c) ' + new Date().getFullYear() + ' <%= package.author.name %>' +
		' | <%= package.license %> License' +
		' | <%= package.repository.url %>' +
		' */\n'
};


/**
 * Gulp Packages
 */

// David's additions
var fs = require('fs');
var readlineSync = require('readline-sync');
var argv = require('yargs').argv;
var babel = require('gulp-babel');


// General
var {gulp, src, dest, watch, series, parallel} = require('gulp');
var del = require('del');
var flatmap = require('gulp-flatmap');
var lazypipe = require('lazypipe');
var rename = require('gulp-rename');
var header = require('gulp-header');
var package = require('./package.json');

// Scripts
var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');
var concat = require('gulp-concat');
var uglify = require('gulp-terser');
var optimizejs = require('gulp-optimize-js');

// Styles
var sass = require('gulp-sass');
var postcss = require('gulp-postcss');
var prefix = require('autoprefixer');
var minify = require('cssnano');

// SVGs
var svgmin = require('gulp-svgmin');

// BrowserSync
var browserSync = require('browser-sync');



/**
 * Gulp Tasks
 */

var getWorkEnv = function (done) {
    if (site) { 
        return done();
    } else {

        websites = fs.readdirSync('./websites')
                     .filter( site => site.indexOf(".") == -1 );

        if (argv.s === true || argv.site === true) {
            console.log("When using -s or --site, you must specify which site you're using.");
            process.exit(0);
        } else if (argv.s || argv.site) {
            site = argv.s || argv.site;
            if ( websites.indexOf(site) == -1 ) {
                console.log(`Website '${site}' does not exist.`);
                console.log("Please use one of the following: " + websites.join(", "));
                process.exit(0);
            }
        } else {
            site = promptForSite();
        }

        workspace = "websites/"+site;
        console.log(`Ok, setting workspace to: ${workspace}`);


        /**
         * Paths to project folders
         */

        paths = {
            input: workspace+'/src/',
            output: workspace+'/dist/',
            scripts: {
                input: workspace+'/src/js/*.js',
                polyfills: '.polyfill.js',
                output: workspace+'/dist/js/'
            },
            styles: {
                input: workspace+'/src/sass/**/*.{scss,sass}',
                output: workspace+'/dist/css/'
            },
            svgs: {
                input: workspace+'/src/svg/*.svg',
                output: workspace+'/dist/svg/'
            },
            copy: {
                input: workspace+'/src/copy/**/*',
                output: workspace+'/dist/'
            },
            typescript: {
                input: workspace+'/src/**/*.ts',
                output: workspace+'/dist/'
            },
            reload: './'+workspace+'/dist/'
        };

        jsTasks = lazypipe()
            .pipe(header, banner.main, {package: package})
            .pipe(optimizejs)
            .pipe(dest, paths.scripts.output)
            .pipe(rename, {suffix: '.min'})
            .pipe(uglify)
            .pipe(optimizejs)
            .pipe(header, banner.main, {package: package})
            .pipe(dest, paths.scripts.output);

        return done();
    }
}



var promptForSite = function () {
    websites = fs.readdirSync('./websites');
    websites = websites.filter( site => site.indexOf(".") == -1 );

    console.log("Here are the websites:");
    websites.forEach(function(site, i){
        console.log(`${i}) ${site}`);
    });

    site = readlineSync.question('Which site do you want to work on? ');

    if (websites.indexOf(site) >= 0) {

    } else if (websites[site] != undefined) {
        site = websites[site];
    } else {
        site = 'default';
    }

    return site;
}




// Remove pre-existing content from output folders
var cleanDist = function (done) {

	// Make sure this feature is activated before running
	if (!settings.clean) return done();

	// Clean the dist folder
	del.sync([
		paths.output
	]);

	// Signal completion
	return done();

};



// Can we use babel for this stuff..?
// Lint, minify, and concatenate scripts
var buildScripts = function (done) {

	// Make sure this feature is activated before running
	if (!settings.scripts) return done();

	// Run tasks on script files
	return src(paths.scripts.input)
		.pipe(flatmap(function(stream, file) {

			// If the file is a directory
			if (file.isDirectory()) {

				// Setup a suffix variable
				var suffix = '';

				// If separate polyfill files enabled
				if (settings.polyfills) {

					// Update the suffix
					suffix = '.polyfills';

					// Grab files that aren't polyfills, concatenate them, and process them
					src([file.path + '/*.js', '!' + file.path + '/*' + paths.scripts.polyfills])
						.pipe(concat(file.relative + '.js'))
						.pipe(jsTasks());

				}

				// Grab all files and concatenate them
				// If separate polyfills enabled, this will have .polyfills in the filename
				src(file.path + '/*.js')
					.pipe(concat(file.relative + suffix + '.js'))
					.pipe(jsTasks());

				return stream;

			}

			// Otherwise, process the file
			return stream.pipe(jsTasks());

		}));

};

// Lint scripts
var lintScripts = function (done) {

	// Make sure this feature is activated before running
	if (!settings.scripts) return done();

	// Lint scripts
	return src(paths.scripts.input)
		.pipe(jshint())
		.pipe(jshint.reporter('jshint-stylish'));

};

// Process, lint, and minify Sass files
var buildStyles = function (done) {

	// Make sure this feature is activated before running
	if (!settings.styles) return done();

	// Run tasks on all Sass files
	return src(paths.styles.input)
		.pipe(sass({
			outputStyle: 'expanded',
			sourceComments: true
		}))
		.pipe(postcss([
			prefix({
				cascade: true,
				remove: true
			})
		]))
		.pipe(header(banner.main, {package: package}))
		.pipe(dest(paths.styles.output))
		.pipe(rename({suffix: '.min'}))
		.pipe(postcss([
			minify({
				discardComments: {
					removeAll: true
				}
			})
		]))
		.pipe(dest(paths.styles.output));

};

// Optimize SVG files
var buildSVGs = function (done) {

	// Make sure this feature is activated before running
	if (!settings.svgs) return done();

	// Optimize SVG files
	return src(paths.svgs.input)
		.pipe(svgmin())
		.pipe(dest(paths.svgs.output));

};




// babel typescript stuff..???
var typescript = function (done) {
    if (!typescript) return done();

    return src(paths.typescript.input)
        .pipe(babel({
//             presets: ['@babel/env']
            "plugins": ["@babel/plugin-transform-typescript"]
        }))
        .pipe(dest(paths.typescript.output));
};








// Copy static files into output folder
var copyFiles = function (done) {

	// Make sure this feature is activated before running
	if (!settings.copy) return done();

	// Copy static files
	return src(paths.copy.input)
		.pipe(dest(paths.copy.output));

};

// Watch for changes to the src directory
var startServer = function (done) {

	// Make sure this feature is activated before running
	if (!settings.reload) return done();

	// Initialize BrowserSync
	browserSync.init({
		server: {
			baseDir: paths.reload
		}
	});

	// Signal completion
	done();

};

// Reload the browser when files change
var reloadBrowser = function (done) {
	if (!settings.reload) return done();
	browserSync.reload();
	done();
};

// Watch for changes
var watchSource = function (done) {
	watch(paths.input, series(build, reloadBrowser));
	done();
};


/**
 * Export Tasks
 */
var build = parallel(
		buildScripts,
		lintScripts,
		buildStyles,
		buildSVGs,
		typescript,
		copyFiles
	);

// Default task
exports.default = series(
    getWorkEnv,
	cleanDist,
	build
);

// Watch and reload
// gulp watch
exports.watch = series(
	exports.default,
	startServer,
	watchSource
);








