import { process as minify } from 'cssnano-simple'
import webpack from 'webpack'
import { RawSource, SourceMapSource } from 'webpack-sources'

// https://github.com/NMFR/optimize-css-assets-webpack-plugin/blob/0a410a9bf28c7b0e81a3470a13748e68ca2f50aa/src/index.js#L20
const CSS_REGEX = /\.css(\?.*)?$/i

type CssMinimizerPluginOptions = {
  postcssOptions: {
    map: false | { prev?: string | false; inline: boolean; annotation: boolean }
  }
}

const isWebpack5 = parseInt(webpack.version!) === 5

export class CssMinimizerPlugin {
  __next_css_remove = true

  private options: CssMinimizerPluginOptions

  constructor(options: CssMinimizerPluginOptions) {
    this.options = options
  }

  optimizeAsset(file: string, asset: any) {
    const postcssOptions = {
      ...this.options.postcssOptions,
      to: file,
      from: file,
    }

    let input: string
    if (postcssOptions.map && asset.sourceAndMap) {
      const { source, map } = asset.sourceAndMap()
      input = source
      postcssOptions.map.prev = map ? map : false
    } else {
      input = asset.source()
    }

    return minify(input, postcssOptions).then((res) => {
      if (res.map) {
        return new SourceMapSource(res.css, file, res.map.toJSON())
      } else {
        return new RawSource(res.css)
      }
    })
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap('CssMinimizerPlugin', (compilation: any) => {
      if (isWebpack5) {
        compilation.hooks.processAssets.tapPromise(
          {
            name: 'CssMinimizerPlugin',
            // @ts-ignore TODO: Remove ignore when webpack 5 is stable
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
          },
          async (assets: any) => {
            const files = Object.keys(assets)
            await Promise.all(
              files
                .filter((file) => CSS_REGEX.test(file))
                .map(async (file) => {
                  const asset = compilation.assets[file]

                  assets[file] = await this.optimizeAsset(file, asset)
                })
            )
          }
        )
        return
      }
      compilation.hooks.optimizeChunkAssets.tapPromise(
        'CssMinimizerPlugin',
        (chunks: webpack.compilation.Chunk[]) =>
          Promise.all(
            chunks
              .reduce(
                (acc, chunk) => acc.concat(chunk.files || []),
                [] as string[]
              )
              .filter((entry) => CSS_REGEX.test(entry))
              .map(async (file) => {
                const asset = compilation.assets[file]

                compilation.assets[file] = await this.optimizeAsset(file, asset)
              })
          )
      )
    })
  }
}
