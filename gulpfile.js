const fs = require('fs');
const path = require('path');
const gulp = require('gulp');
const colors = require('ansi-colors');

const through = require('through2');
const babel = require('gulp-babel');
const stripBom = require('remove-bom-buffer');
const changed = require('gulp-changed');
const sourcemaps = require('gulp-sourcemaps');
const babelOpts = require("babel-core/lib/transformation/file/options/build-config-chain")({ filename: __filename })[0].options;
const plumber = require('gulp-plumber');
const watch = require('gulp-watch');

let i = 1;
const readThrough = function () {
    return through.obj(function (file, enc, cb) {
        console.log('compiling', colors.blue(path.basename(file.path)), i++);
        file.base = path.join(file.base.substring(0, file.base.indexOf('src')), 'src');
        file.contents = stripBom(fs.readFileSync(file.path));
        this.push(file);
        cb();
    });
};

gulp.task('babel', () => {
    return gulp.src(['src/**/*.js', '!**/*jb_tmp*'], { cwd: '.', read: false })
        .pipe(plumber())
        .pipe(changed('out'))
        .pipe(readThrough())
        .pipe(sourcemaps.init())
        .pipe(babel(babelOpts))
        .pipe(sourcemaps.write('.', { sourceRoot: '../src' }))
        .pipe(gulp.dest('out'));
});


gulp.task('watch', ['babel'], () => {
    return watch(['src/**/*.js', '!**/*jb_tmp*'], (change) => {
        return gulp.src(change.path, { cwd: __dirname, read: false })
            .pipe(plumber())
            .pipe(readThrough())
            .pipe(sourcemaps.init())
            .pipe(babel(babelOpts))
            .pipe(sourcemaps.write('.', { sourceRoot: '../src' }))
            .pipe(gulp.dest('out'));
    });
});
