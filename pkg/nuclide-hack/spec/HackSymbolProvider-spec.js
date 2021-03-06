/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 */

import type {HackSearchPosition} from '../../nuclide-hack-rpc/lib/HackService-types';
import type {NuclideUri} from '../../commons-node/nuclideUri';

import {HackSymbolProvider} from '../lib/HackSymbolProvider';
import ReactDOM from 'react-dom';
import TestUtils from 'react-addons-test-utils';
import {clearRequireCache, uncachedRequire} from '../../nuclide-test-helpers';
import invariant from 'assert';

describe('HackSymbolProvider', () => {
  // These tests are set up so that calls to getHackLanguageForUri() will delegate to this
  // function, so make sure to define this function at the start of your test to mock out this
  // behavior.
  let getHackLanguageForUri: ?((directory: NuclideUri) => Promise<mixed>);
  let isFileInProject: ?((directory: NuclideUri) => Promise<boolean>);
  let getDirectories: ?(() => Array<atom$Directory>);
  const mockDirectory: atom$Directory = ({getPath: () => 'uri1'}: any);
  const mockDirectory2: atom$Directory = ({getPath: () => 'uri2'}: any);

  beforeEach(() => {
    getHackLanguageForUri = null;
    isFileInProject = null;
    getDirectories = null;
    spyOn(require('../lib/HackLanguage'), 'getHackLanguageForUri')
      .andCallFake((directory: NuclideUri) => {
        invariant(getHackLanguageForUri);
        return getHackLanguageForUri(directory);
      });
    spyOn(require('../lib/HackLanguage'), 'isFileInHackProject')
      .andCallFake((directory: NuclideUri) => {
        invariant(isFileInProject);
        return isFileInProject(directory);
      });
    spyOn(atom.project, 'getDirectories')
      .andCallFake(() => {
        invariant(getDirectories);
        return getDirectories();
      });
    uncachedRequire(require, '../lib/HackSymbolProvider');
  });

  afterEach(() => {
    jasmine.unspy(atom.project, 'getDirectories');
    jasmine.unspy(require('../lib/HackLanguage'), 'isFileInHackProject');
    jasmine.unspy(require('../lib/HackLanguage'), 'getHackLanguageForUri');
    clearRequireCache(require, '../lib/HackSymbolProvider');
  });

  describe('executeQuery()', () => {
    it('returns an empty array for an empty query', () => {
      waitsForPromise(async () => {
        const results = await HackSymbolProvider.executeQuery('');
        expect(results).toEqual([]);
      });
    });

    it('local search returns local paths when searching local directories', () => {
      waitsForPromise(async () => {
        // Set up the HackService to return some canned results.
        const cannedResults = [
          {path: '/some/local/path/asdf.txt', line: 1, column: 42, context: 'aha'},
        ];
        const hackService = createDummyHackService();
        const queryMethod = spyOn(hackService, 'executeQuery').andReturn(cannedResults);
        getDirectories = jasmine.createSpy('getDirectories').andReturn([mockDirectory]);
        getHackLanguageForUri = jasmine.createSpy('getHackLanguageForUri').andReturn(
          hackService);

        const query = 'asdf';
        const results = await HackSymbolProvider.executeQuery(query);

        // Verify the expected results were returned by delegating to the HackService.
        expect(results).toEqual(cannedResults);
        expect(queryMethod.callCount).toBe(1);
        expect(queryMethod.argsForCall[0]).toEqual([query]);
      });
    });

    it('remote search returns remote paths when searching remote directories', () => {
      waitsForPromise(async () => {
        // Set up the HackService to return some canned results.
        const cannedResults = [
          {
            path: 'nuclide://some.host/some/local/path/asdf.txt',
            line: 1,
            column: 42,
            context: 'aha',
          },
        ];
        const hackService = createDummyHackService();
        const queryMethod = spyOn(hackService, 'executeQuery').andReturn(cannedResults);
        getDirectories = jasmine.createSpy('getDirectories').andReturn([mockDirectory]);
        getHackLanguageForUri = jasmine.createSpy('getHackLanguageForUri').andReturn(
          hackService);

        const query = 'asdf';
        const results = await HackSymbolProvider.executeQuery(query);

        // Verify the expected results were returned by delegating to the HackService,
        // and that local file paths are converted to NuclideUris.
        expect(results).toEqual(cannedResults);
        expect(queryMethod.callCount).toBe(1);
        expect(queryMethod.argsForCall[0]).toEqual([query]);
      });
    });

    it('should only query once per unique service, not once per directory', () => {
      waitsForPromise(async () => {
        // Set up the HackService to return some canned results.
        const cannedResults = [
          {
            path: 'nuclide://some.host/some/local/path/asdf.txt',
            line: 1,
            column: 42,
            context: 'aha',
          },
        ];
        const hackService = createDummyHackService();
        const queryMethod = spyOn(hackService, 'executeQuery').andReturn(cannedResults);
        getDirectories = jasmine.createSpy('getDirectories').andReturn([
          mockDirectory,
          mockDirectory2,
        ]);
        getHackLanguageForUri = jasmine.createSpy('getHackLanguageForUri').andReturn(
          hackService);
        // both directories return the same service

        const query = 'asdf';
        const results = await HackSymbolProvider.executeQuery(query);

        // Verify the expected results were returned by delegating to the HackService,
        // and that local file paths are converted to NuclideUris.
        expect(results).toEqual(cannedResults);
        expect(queryMethod.callCount).toBe(1);
        expect(queryMethod.argsForCall[0]).toEqual([query]);
      });
    });

    it('should query once per unique service', () => {
      waitsForPromise(async () => {
        // Set up the HackService to return some canned results.
        const cannedResults1 = [
          {
            path: 'nuclide://some.host/some/local/path/asdf.txt',
            line: 1,
            column: 42,
            context: 'aha',
          },
        ];
        const cannedResults2 = [
          {
            path: 'nuclide://some.host/other/local/path/asdf.txt',
            line: 2,
            column: 15,
            context: 'hehe',
          },
        ];
        const hackService1 = createDummyHackService();
        const hackService2 = createDummyHackService();
        const queryMethod1 = spyOn(hackService1, 'executeQuery').andReturn(cannedResults1);
        const queryMethod2 = spyOn(hackService2, 'executeQuery').andReturn(cannedResults2);
        getDirectories = jasmine.createSpy('getDirectories').andReturn([
          mockDirectory,
          mockDirectory2,
        ]);
        getHackLanguageForUri = jasmine.createSpy('getHackLanguageForUri').andCallFake(uri => {
          return (uri === mockDirectory.getPath()) ? hackService1 : hackService2;
        });

        const query = 'asdf';
        const results = await HackSymbolProvider.executeQuery(query);

        // Verify the expected results were returned by delegating to the HackService,
        // and that local file paths are converted to NuclideUris.
        expect(results).toEqual(cannedResults1.concat(cannedResults2));
        expect(queryMethod1.callCount).toBe(1);
        expect(queryMethod1.argsForCall[0]).toEqual([query]);
        expect(queryMethod2.callCount).toBe(1);
        expect(queryMethod2.argsForCall[0]).toEqual([query]);
      });
    });
  });

  describe('Result rendering', () => {
    it('should work', () => {
      const mockResult = {
        path: '/some/arbitrary/path',
        name: 'IExampleSymbolInterface',
        additionalInfo: 'interface',
        column: 1,
        length: 2,
        line: 3,
        scope: 'scope',
      };
      invariant(HackSymbolProvider.getComponentForItem != null);
      const reactElement = HackSymbolProvider.getComponentForItem(mockResult);
      expect(reactElement.props.title).toBe('interface');
      const renderedComponent = TestUtils.renderIntoDocument(reactElement);
      const renderedNode = ReactDOM.findDOMNode(renderedComponent);

      // $FlowFixMe
      expect(renderedNode.querySelectorAll('.omnisearch-symbol-result-filename').length).toBe(1);
      // $FlowFixMe
      expect(renderedNode.querySelectorAll('.icon-puzzle').length).toBe(1);
    });
  });
});

function createDummyHackService(): any {
  return {
    executeQuery(
      rootDirectory: NuclideUri,
      queryString: string,
    ): Promise<Array<HackSearchPosition>> {
      throw new Error('replace with implementation for testing');
    },
  };
}
