/* eslint-env node */
'use strict';

const fs         = require('fs');
const decompress = require('decompress');
const mkdirp     = require('mkdirp');
const rimraf     = require('rimraf');
const assert     = require('./helpers/assert');

var stubProject = {
  name: function() {
    return 'my-project';
  }
};

describe('fastboot-app-server plugin', function() {
  var subject, plugin, mockUI, context;

  before(function() {
    subject = require('../index');
  });

  beforeEach(function() {
    mockUI = {
      verbose: true,
      messages: [],
      write: function() { },
      writeLine: function(message) {
        this.messages.push(message);
      }
    };

    plugin = subject.createDeployPlugin({
      name: 'fastboot-app-server'
    });

    context = {
      ui: mockUI,

      project: stubProject,

      commandOptions: {},

      config: {
        'fastboot-app-server': {
        }
      }
    }
  });

  it('has a name', function() {
    assert.equal(plugin.name, 'fastboot-app-server');
  });

  describe('hooks', function() {
    beforeEach(function() {
      plugin.beforeHook(context);
      plugin.configure(context);
    });

    it('implements the correct hooks', function() {
      assert.ok(plugin.configure);
      assert.ok(plugin.setup);
      assert.ok(plugin.willBuild);
      assert.ok(plugin.didPrepare);
    });

    describe('#setup', function() {
      it('adds a function to the deploy context that can be used to write a fastboot-app-server manifest', function() {
        let dataToMergeIntoDeployContext = plugin.setup(context);

        let downloaderManifestContent = dataToMergeIntoDeployContext.fastbootDownloaderManifestContent;

        let manifestContent = downloaderManifestContent('bucket-name', 'revision-key');

        let expectedJSON = {
          bucket: 'bucket-name',
          key: 'revision-key'
        };

        assert.deepEqual(JSON.parse(manifestContent), expectedJSON);
      });

      it('adds a `fastbootArchivePrefix` to the deploy context that can be used in other hooks to work out a name for the fastboot build to deploy', function() {
        let dataToMergeIntoDeployContext = plugin.setup(context);

        assert.equal(dataToMergeIntoDeployContext.fastbootArchivePrefix, 'dist-');
      });
    });

    describe('#willBuild', function() {
      it('doesn not fail when `fastbootDistDir` does not exist', function() {
        plugin.willBuild(context);

        assert.notOk(fs.existsSync('tmp/fastboot-deploy'));
      });

      it('cleans up `fastbootDistDir` if it exists', function() {
        mkdirp.sync('tmp/fastboot-deploy');

        assert.ok(fs.existsSync('tmp/fastboot-deploy'));

        plugin.willBuild(context);

        assert.notOk(fs.existsSync('tmp/fastboot-deploy'));
      });

      it('cleans up `fastbootDistDir` if it exists and another DIR is configured than the default', function() {
        let FASTBOOT_DIST_DIR = 'tmp/lolbar';

        context.config['fastboot-app-server'].fastbootDistDir = FASTBOOT_DIST_DIR;

        mkdirp.sync(FASTBOOT_DIST_DIR);

        assert.ok(fs.existsSync(FASTBOOT_DIST_DIR));

        plugin.willBuild(context);

        assert.notOk(fs.existsSync(FASTBOOT_DIST_DIR));
      });
    });

    describe('#didPrepare', function() {
      beforeEach(function() {
        let DIST_DIR = 'tmp/deploy-dist'

        rimraf.sync('tmp');

        context.fastbootArchivePrefix = 'dist-';
        context.distDir = DIST_DIR;
        context.revisionData = {
          revisionKey: '1234'
        };

        mkdirp.sync(DIST_DIR);
        fs.writeFileSync(`${DIST_DIR}/deploy.txt`, 'deployment');
        mkdirp.sync(`${DIST_DIR}/assets`);
        fs.writeFileSync(`${DIST_DIR}/assets/app.js`, 'deployment');
        fs.writeFileSync(`${DIST_DIR}/assets/app.map`, 'deployment');
      });

      it('zips the contents of `distDir` and writes them to `fastbootDistDir` as a zip tagged by `revisionKey`', function() {
        return plugin.didPrepare(context)
          .then(() => {
            assert.ok(fs.existsSync('tmp/fastboot-deploy/dist-1234.zip'));
          });
      });

      it('zips the content of distDir as expected', function() {
        return plugin.didPrepare(context)
          .then(() => {
            return decompress('tmp/fastboot-deploy/dist-1234.zip', 'tmp/fastboot-deploy');
          })
          .then(() => {
            let deployText = fs.readFileSync('tmp/fastboot-deploy/dist/deploy.txt')

            assert.equal(deployText, 'deployment');
            assert.ok(fs.existsSync('tmp/fastboot-deploy/dist/assets/app.js'));
            assert.ok(fs.existsSync('tmp/fastboot-deploy/dist/assets/app.map'));
          })
      });

      it('adds fastbootArchiveName and fastbootArchivePath info to the deplyoment context', function() {
        return plugin.didPrepare(context)
          .then((info) => {
            assert.equal(info.fastbootArchiveName, 'dist-1234.zip');
            assert.equal(info.fastbootArchivePath, 'tmp/fastboot-deploy/dist-1234.zip');
          });
      });
    });

    describe('#didPrepare/globPattern', function() {
      beforeEach(function() {
        context.config['fastboot-app-server'].ignoreFiles = "**/*.map";
        plugin.configure(context);

        let DIST_DIR = 'tmp/deploy-dist'
        rimraf.sync('tmp');

        context.fastbootArchivePrefix = 'dist-';
        context.distDir = DIST_DIR;
        context.revisionData = {
          revisionKey: '1234'
        };

        mkdirp.sync(DIST_DIR);
        fs.writeFileSync(`${DIST_DIR}/deploy.txt`, 'deployment');
        mkdirp.sync(`${DIST_DIR}/assets`);
        fs.writeFileSync(`${DIST_DIR}/assets/app.js`, 'deployment');
        fs.writeFileSync(`${DIST_DIR}/assets/app.map`, 'deployment');
      });

      it('zips the contents of `distDir` and writes them to `fastbootDistDir` as a zip tagged by `revisionKey`', function() {
        return plugin.didPrepare(context)
          .then(() => {
            assert.ok(fs.existsSync('tmp/fastboot-deploy/dist-1234.zip'));
          });
      });

      it('globPattern option zips the content of distDir as expected', function() {
        return plugin.didPrepare(context)
          .then(() => {
            return decompress('tmp/fastboot-deploy/dist-1234.zip', 'tmp/fastboot-deploy');
          })
          .then(() => {
            let deployText = fs.readFileSync('tmp/fastboot-deploy/dist/deploy.txt')

            assert.equal(deployText, 'deployment');
            assert.ok(fs.existsSync('tmp/fastboot-deploy/dist/assets/app.js'));
            assert.notOk(fs.existsSync('tmp/fastboot-deploy/dist/assets/app.map'));
          })
      });

      it('adds fastbootArchiveName and fastbootArchivePath info to the deplyoment context', function() {
        return plugin.didPrepare(context)
          .then((info) => {
            assert.equal(info.fastbootArchiveName, 'dist-1234.zip');
            assert.equal(info.fastbootArchivePath, 'tmp/fastboot-deploy/dist-1234.zip');
          });
      });
    });
  });
});
